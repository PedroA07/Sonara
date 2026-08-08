//! Modo vídeo (E2) — baixar, apagar e medir os vídeos das faixas.
//!
//! ADR-05: o vídeo é um arquivo **separado**, guardado em
//! `<pasta de downloads>/.video/<id do track>.mp4`, e nunca substitui o áudio.
//! Quem só quer ouvir continua com o mesmo arquivo de antes; quem apaga os
//! vídeos para liberar espaço não perde nenhuma música.
//!
//! O nome do arquivo vem do id da faixa, não do título: título é editável, e um
//! arquivo nomeado pelo título vira órfão na primeira correção de digitação.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{VideoProbe, VideoStorage, VideoStorageItem};
use crate::services::downloader::{
    build_video_args, build_video_probe_args, friendly_error, parse_file_line, parse_progress,
    parse_video_probe, VideoQuality,
};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

use super::download::{download_dir, ffmpeg_location, Downloads};

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct VideoProgress {
    track_id: i64,
    job_id: i64,
    status: String, // "running" | "done" | "error" | "canceled"
    progress: f64,
    message: String,
    speed: String,
    eta: String,
    path: Option<String>,
}

/// Pasta dos vídeos. Escondida (`.video`) de propósito: quem abre a pasta de
/// downloads está procurando músicas, não um monte de MP4 de 80 MB.
pub fn video_dir(app: &AppHandle) -> PathBuf {
    download_dir(app).join(".video")
}

fn setting(app: &AppHandle, key: &str) -> Option<String> {
    let db = app.state::<Db>();
    let conn = db.0.lock().ok()?;
    conn.query_row("SELECT value FROM setting WHERE key = ?1", [key], |r| {
        r.get::<_, String>(0)
    })
    .ok()
    .filter(|v| !v.trim().is_empty())
}

fn quality_of(app: &AppHandle, requested: Option<String>) -> VideoQuality {
    requested
        .or_else(|| setting(app, "video_quality"))
        .map(|q| VideoQuality::parse(&q))
        .unwrap_or(VideoQuality::P720)
}

/// De onde baixar o vídeo desta faixa.
///
/// A primeira escolha é a URL do download que originou a faixa — é literalmente
/// o mesmo vídeo, então bate com a gravação que a pessoa tem. Para faixas
/// importadas do disco não existe URL, e aí resta procurar por "artista título",
/// que é um palpite: por isso a UI mostra o título encontrado antes de baixar.
fn source_for(conn: &rusqlite::Connection, track_id: i64) -> AppResult<String> {
    if let Ok(url) = conn.query_row(
        "SELECT url FROM download_job
          WHERE track_id = ?1 AND url IS NOT NULL AND TRIM(url) <> ''
          ORDER BY id DESC LIMIT 1",
        [track_id],
        |r| r.get::<_, String>(0),
    ) {
        if url.starts_with("http") {
            return Ok(url);
        }
    }

    let (title, artist): (String, String) = conn
        .query_row(
            "SELECT t.title,
                    COALESCE(
                      (SELECT ar.name FROM track_artist ta JOIN artist ar ON ar.id = ta.artist_id
                        WHERE ta.track_id = t.id ORDER BY ar.name LIMIT 1),
                      (SELECT ar2.name FROM album al2 JOIN artist ar2 ON ar2.id = al2.artist_id
                        WHERE al2.id = t.album_id), '')
               FROM track t WHERE t.id = ?1",
            [track_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| AppError::Download(format!("faixa {track_id} não está na biblioteca")))?;

    let q = format!("{artist} {title}").trim().to_string();
    if q.is_empty() {
        return Err(AppError::Download(
            "Esta faixa não tem título nem artista para procurar o vídeo.".into(),
        ));
    }
    Ok(format!("ytsearch1:{q}"))
}

/// Quanto o vídeo desta faixa vai ocupar, antes de baixar.
#[tauri::command]
pub async fn video_probe(
    app: AppHandle,
    track_id: i64,
    quality: Option<String>,
) -> AppResult<VideoProbe> {
    let source = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
        source_for(&conn, track_id)?
    };

    let quality = quality_of(&app, quality);
    let args = build_video_probe_args(&source, quality);
    let out = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| AppError::Download(format!("yt-dlp não encontrado no app ({e}).")))?
        .args(args)
        .output()
        .await
        .map_err(|e| AppError::Download(format!("Não foi possível consultar o vídeo: {e}")))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Download(friendly_error(
            &err,
            out.status.code().unwrap_or(-1),
        )));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let (bytes, height, title) = text
        .lines()
        .find_map(parse_video_probe)
        .ok_or_else(|| AppError::Download("Nenhum vídeo compatível foi encontrado.".into()))?;

    Ok(VideoProbe {
        track_id,
        source_url: source,
        size_bytes: bytes,
        height,
        title,
        quality: quality.as_str().to_string(),
    })
}

/// Baixa o vídeo da faixa. Reaproveita a tabela `download_job` e o mapa de
/// processos, então "Cancelar" e o histórico funcionam iguais aos do áudio.
#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    track_id: i64,
    quality: Option<String>,
) -> AppResult<i64> {
    let source = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
        source_for(&conn, track_id)?
    };

    let dir = video_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| {
        AppError::Download(format!(
            "Não foi possível usar a pasta de vídeos ({}): {e}",
            dir.display()
        ))
    })?;

    let job_id = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
        conn.execute(
            "INSERT INTO download_job (url, type, status, progress, track_id)
             VALUES (?1,'video','running',0,?2)",
            rusqlite::params![source, track_id],
        )?;
        conn.last_insert_rowid()
    };

    let template = dir.join(format!("{track_id}.%(ext)s"));
    let args = build_video_args(
        &source,
        &template.to_string_lossy(),
        &ffmpeg_location(&app),
        quality_of(&app, quality),
    );

    let (mut rx, child) = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| AppError::Download(format!("yt-dlp não encontrado no app ({e}).")))?
        .args(args)
        .spawn()
        .map_err(|e| AppError::Download(format!("Não foi possível iniciar o yt-dlp: {e}")))?;

    if let Ok(mut map) = app.state::<Downloads>().0.lock() {
        map.insert(job_id, child);
    }

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut file: Option<String> = None;
        let mut last_err = String::new();
        let mut title = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for raw in text.lines() {
                        if let Some(p) = parse_file_line(raw) {
                            file = Some(p);
                        } else if let Some(p) = parse_progress(raw) {
                            if !p.title.is_empty() {
                                title = p.title.clone();
                            }
                            let _ = app2.emit(
                                "video-progress",
                                VideoProgress {
                                    track_id,
                                    job_id,
                                    status: "running".into(),
                                    progress: p.percent,
                                    message: String::new(),
                                    speed: p.speed,
                                    eta: p.eta,
                                    path: None,
                                },
                            );
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    for raw in String::from_utf8_lossy(&bytes).lines() {
                        let t = raw.trim();
                        if t.starts_with("ERROR") || t.contains("Unable to") {
                            last_err = t.to_string();
                        }
                    }
                }
                CommandEvent::Error(e) => {
                    last_err = format!("falha ao executar o yt-dlp: {e}");
                }
                CommandEvent::Terminated(payload) => {
                    let canceled = app2
                        .state::<Downloads>()
                        .0
                        .lock()
                        .map(|mut m| m.remove(&job_id).is_none())
                        .unwrap_or(false);
                    let code = payload.code.unwrap_or(-1);
                    finish(&app2, job_id, track_id, canceled, file.take(), &last_err, code, &title);
                }
                _ => {}
            }
        }
    });

    Ok(job_id)
}

/// Fecha o job e grava (ou não) o vídeo na faixa.
#[allow(clippy::too_many_arguments)]
fn finish(
    app: &AppHandle,
    job_id: i64,
    track_id: i64,
    canceled: bool,
    file: Option<String>,
    last_err: &str,
    code: i32,
    title: &str,
) {
    let db = app.state::<Db>();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(_) => return,
    };

    let close = |status: &str, error: Option<&str>, path: Option<&str>| {
        let _ = conn.execute(
            "UPDATE download_job
                SET status = ?2, progress = ?3, error = ?4, file_path = ?5,
                    title = COALESCE(NULLIF(?6,''), title), finished_at = datetime('now')
              WHERE id = ?1",
            rusqlite::params![
                job_id,
                status,
                if status == "done" { 100.0 } else { 0.0 },
                error,
                path,
                title
            ],
        );
    };

    if canceled {
        close("canceled", Some("Cancelado"), None);
        let _ = app.emit(
            "video-progress",
            VideoProgress {
                track_id,
                job_id,
                status: "canceled".into(),
                message: "Download do vídeo cancelado".into(),
                ..Default::default()
            },
        );
        return;
    }

    let Some(path) = file.filter(|p| PathBuf::from(p).is_file()) else {
        let msg = if last_err.is_empty() && code == 0 {
            "Nenhum vídeo compatível foi encontrado para esta música.".to_string()
        } else {
            friendly_error(last_err, code)
        };
        close("error", Some(&msg), None);
        let _ = app.emit(
            "video-progress",
            VideoProgress {
                track_id,
                job_id,
                status: "error".into(),
                message: msg,
                ..Default::default()
            },
        );
        return;
    };

    let bytes = std::fs::metadata(&path).map(|m| m.len() as i64).ok();
    let _ = conn.execute(
        "UPDATE track SET video_path = ?2, video_bytes = ?3 WHERE id = ?1",
        rusqlite::params![track_id, path, bytes],
    );
    close("done", None, Some(&path));

    let _ = app.emit(
        "video-progress",
        VideoProgress {
            track_id,
            job_id,
            status: "done".into(),
            progress: 100.0,
            message: "Vídeo pronto".into(),
            path: Some(path),
            ..Default::default()
        },
    );
    let _ = app.emit("library-changed", ());
}

/// Apaga o vídeo de uma faixa. O áudio nunca é tocado (ADR-05).
#[tauri::command]
pub fn delete_video(app: AppHandle, track_id: i64) -> AppResult<()> {
    let db = app.state::<Db>();
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let path: Option<String> = conn
        .query_row("SELECT video_path FROM track WHERE id = ?1", [track_id], |r| r.get(0))
        .map_err(|_| AppError::Download(format!("faixa {track_id} não está na biblioteca")))?;

    if let Some(p) = path.as_deref().filter(|p| !p.trim().is_empty()) {
        // Arquivo já sumido não é erro: o objetivo era ficar sem ele.
        let _ = std::fs::remove_file(p);
    }
    conn.execute(
        "UPDATE track SET video_path = NULL, video_bytes = NULL, video_height = NULL WHERE id = ?1",
        [track_id],
    )?;
    let _ = app.emit("library-changed", ());
    Ok(())
}

/// Calibração de lipsync, por faixa.
#[tauri::command]
pub fn set_video_offset(db: tauri::State<Db>, track_id: i64, offset_ms: i64) -> AppResult<i64> {
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let offset_ms = offset_ms.clamp(-5_000, 5_000);
    conn.execute(
        "UPDATE track SET video_offset_ms = ?2 WHERE id = ?1",
        rusqlite::params![track_id, offset_ms],
    )?;
    Ok(offset_ms)
}

/// Quanto os vídeos ocupam, faixa a faixa — a seção Armazenamento em
/// Configurações. Faixas cujo arquivo sumiu do disco entram com `missing`, para
/// a tela poder oferecer a limpeza do registro em vez de mentir sobre o espaço.
#[tauri::command]
pub fn video_storage(app: AppHandle) -> AppResult<VideoStorage> {
    let db = app.state::<Db>();
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, title, video_path, video_bytes, video_height
           FROM track WHERE video_path IS NOT NULL AND TRIM(video_path) <> ''
          ORDER BY video_bytes DESC",
    )?;

    let mut items = Vec::new();
    let mut total = 0i64;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, Option<i64>>(3)?,
            r.get::<_, Option<i64>>(4)?,
        ))
    })?;

    for row in rows.flatten() {
        let (id, title, path, stored_bytes, height) = row;
        // O tamanho real no disco manda sobre o que foi gravado no download:
        // o arquivo pode ter sido apagado por fora.
        let on_disk = std::fs::metadata(&path).map(|m| m.len() as i64).ok();
        let missing = on_disk.is_none();
        let bytes = on_disk.or(stored_bytes).unwrap_or(0);
        if !missing {
            total += bytes;
        }
        items.push(VideoStorageItem { track_id: id, title, path, bytes, height, missing });
    }

    Ok(VideoStorage { total_bytes: total, items })
}

/// Apaga todos os vídeos de uma vez. Devolve quantos foram removidos.
#[tauri::command]
pub fn delete_all_videos(app: AppHandle) -> AppResult<usize> {
    let ids: Vec<i64> = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
        let mut stmt = conn.prepare(
            "SELECT id FROM track WHERE video_path IS NOT NULL AND TRIM(video_path) <> ''",
        )?;
        let rows = stmt.query_map([], |r| r.get::<_, i64>(0))?;
        rows.flatten().collect()
    };

    let mut n = 0usize;
    for id in ids {
        if delete_video(app.clone(), id).is_ok() {
            n += 1;
        }
    }
    Ok(n)
}
