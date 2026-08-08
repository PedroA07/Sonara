//! Comandos de letra (E1). Este PR cobre só as origens **locais** da cadeia do
//! ADR-04 — tags embutidas, arquivo `.lrc` ao lado do áudio e cache no banco.
//! O provedor online entra no PR seguinte, no ponto marcado em `resolve`.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{Lyrics, LyricsKind, LyricsResolution, LyricsSource};
use crate::services::lyrics as svc;
use lofty::file::TaggedFileExt;
use lofty::tag::ItemKey;
use std::path::{Path, PathBuf};
use tauri::State;

// ─────────────────────────── util ───────────────────────────

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn kind_str(k: LyricsKind) -> &'static str {
    match k {
        LyricsKind::Synced => "synced",
        LyricsKind::Plain => "plain",
        LyricsKind::Instrumental => "instrumental",
    }
}

fn kind_from(s: &str) -> LyricsKind {
    match s {
        "synced" => LyricsKind::Synced,
        "instrumental" => LyricsKind::Instrumental,
        _ => LyricsKind::Plain,
    }
}

fn source_str(s: LyricsSource) -> &'static str {
    match s {
        LyricsSource::Embedded => "embedded",
        LyricsSource::Sidecar => "sidecar",
        LyricsSource::Provider => "provider",
        LyricsSource::Manual => "manual",
    }
}

fn source_from(s: &str) -> LyricsSource {
    match s {
        "embedded" => LyricsSource::Embedded,
        "sidecar" => LyricsSource::Sidecar,
        "provider" => LyricsSource::Provider,
        _ => LyricsSource::Manual,
    }
}

/// Caminho e duração da faixa. Erro tipado quando o id não existe, em vez de
/// devolver "nenhuma letra" e mascarar um bug de chamada.
fn track_row(conn: &rusqlite::Connection, track_id: i64) -> AppResult<(String, Option<f64>)> {
    conn.query_row(
        "SELECT file_path, duration FROM track WHERE id = ?1",
        [track_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .map_err(|_| AppError::Lyrics(format!("faixa {track_id} não está na biblioteca")))
}

/// Monta o `Lyrics` a partir do conteúdo bruto, aplicando a calibração e
/// fechando a última linha com a duração da faixa.
#[allow(clippy::too_many_arguments)]
fn build(
    track_id: i64,
    content: &str,
    source: LyricsSource,
    provider: Option<String>,
    lang: Option<String>,
    offset_ms: i64,
    duration_secs: Option<f64>,
    // `stored_kind`: tipo gravado no banco, quando existe. "instrumental" não
    // sai do parse — não há conteúdo de onde deduzi-lo —, então vem daqui.
    stored_kind: Option<LyricsKind>,
) -> Lyrics {
    if matches!(stored_kind, Some(LyricsKind::Instrumental)) {
        return Lyrics {
            track_id,
            kind: LyricsKind::Instrumental,
            source,
            provider,
            lang,
            offset_ms,
            lines: Vec::new(),
            plain_text: None,
        };
    }

    let mut parsed = svc::parse(content, offset_ms);
    let duration_ms = duration_secs.map(|d| (d * 1000.0).round() as i64);
    svc::close_with_duration(&mut parsed.lines, duration_ms);

    Lyrics {
        track_id,
        kind: parsed.kind,
        source,
        provider,
        lang,
        offset_ms,
        lines: parsed.lines,
        plain_text: parsed.plain_text,
    }
}

// ─────────────────────────── origens locais ───────────────────────────

/// Tags dentro do arquivo de áudio. SYLT (sincronizada) tem prioridade sobre
/// USLT/©lyr/LYRICS, porque letra com tempo é sempre melhor que texto solto.
fn read_embedded(path: &Path) -> Option<String> {
    let tagged = lofty::read_from_path(path).ok()?;

    // SYLT só existe em ID3v2, e o lofty o expõe como frame cru.
    if let Some(id3) = tagged
        .tags()
        .iter()
        .find(|t| matches!(t.tag_type(), lofty::tag::TagType::Id3v2))
    {
        if let Some(lrc) = sylt_to_lrc(id3) {
            return Some(lrc);
        }
    }

    let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
    let text = tag.get_string(&ItemKey::Lyrics)?;
    (!text.trim().is_empty()).then(|| text.to_string())
}

/// Converte o texto sincronizado do ID3 em LRC, que é o formato único que o
/// resto do sistema entende.
fn sylt_to_lrc(tag: &lofty::tag::Tag) -> Option<String> {
    use lofty::id3::v2::SynchronizedTextFrame;

    for item in tag.items() {
        // O frame chega como bytes opacos; só o SYLT desserializa aqui.
        if let lofty::tag::ItemValue::Binary(data) = item.value() {
            if let Ok(frame) = SynchronizedTextFrame::parse(data, Default::default()) {
                if frame.content.is_empty() {
                    continue;
                }
                let mut out = String::new();
                for (ts, text) in &frame.content {
                    // `TimestampFormat::MPEG` conta quadros, não tempo; sem a
                    // taxa do arquivo não dá para converter, então é ignorado.
                    if !matches!(frame.timestamp_format, lofty::id3::v2::TimestampFormat::MS) {
                        return None;
                    }
                    let total = *ts as i64;
                    let (m, s, cs) = (total / 60_000, (total % 60_000) / 1000, (total % 1000) / 10);
                    out.push_str(&format!("[{m:02}:{s:02}.{cs:02}]{}\n", text.trim_matches('\n')));
                }
                return Some(out);
            }
        }
    }
    None
}

/// `.lrc` (preferido) ou `.txt` com o mesmo nome do arquivo de áudio.
fn read_sidecar(audio: &Path) -> Option<String> {
    for ext in ["lrc", "LRC", "txt", "TXT"] {
        let candidate = audio.with_extension(ext);
        if candidate.is_file() {
            if let Ok(bytes) = std::fs::read(&candidate) {
                let text = svc::decode_text(&bytes);
                if !text.trim().is_empty() {
                    return Some(text);
                }
            }
        }
    }
    None
}

// ─────────────────────────── persistência ───────────────────────────

struct StoredLyrics {
    source: String,
    provider: Option<String>,
    kind: String,
    content: String,
    lang: Option<String>,
    offset_ms: i64,
}

fn load_stored(conn: &rusqlite::Connection, track_id: i64) -> Option<StoredLyrics> {
    conn.query_row(
        "SELECT source, provider, kind, content, lang, offset_ms FROM lyrics WHERE track_id = ?1",
        [track_id],
        |r| {
            Ok(StoredLyrics {
                source: r.get(0)?,
                provider: r.get(1)?,
                kind: r.get(2)?,
                content: r.get(3)?,
                lang: r.get(4)?,
                offset_ms: r.get(5)?,
            })
        },
    )
    .ok()
}

#[allow(clippy::too_many_arguments)]
fn save(
    conn: &rusqlite::Connection,
    track_id: i64,
    source: LyricsSource,
    provider: Option<&str>,
    provider_id: Option<&str>,
    kind: LyricsKind,
    content: &str,
    lang: Option<&str>,
    offset_ms: i64,
    fetched: bool,
) -> AppResult<()> {
    let now = now_secs();
    conn.execute(
        "INSERT INTO lyrics (track_id, source, provider, provider_id, kind, content, lang,
                             offset_ms, fetched_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
         ON CONFLICT(track_id) DO UPDATE SET
           source = excluded.source, provider = excluded.provider,
           provider_id = excluded.provider_id, kind = excluded.kind,
           content = excluded.content, lang = excluded.lang,
           offset_ms = excluded.offset_ms, fetched_at = excluded.fetched_at,
           updated_at = excluded.updated_at",
        rusqlite::params![
            track_id, source_str(source), provider, provider_id, kind_str(kind),
            content, lang, offset_ms, fetched.then_some(now), now
        ],
    )?;
    // Achou letra: o registro de "não achei" deixa de valer.
    conn.execute("DELETE FROM lyrics_misses WHERE track_id = ?1", [track_id])?;
    Ok(())
}

// ─────────────────────────── comandos ───────────────────────────

/// Letra já conhecida desta faixa, sem procurar em lugar nenhum.
#[tauri::command]
pub fn lyrics_get(db: State<Db>, track_id: i64) -> AppResult<Option<Lyrics>> {
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let (_, duration) = track_row(&conn, track_id)?;
    Ok(load_stored(&conn, track_id).map(|s| {
        build(
            track_id,
            &s.content,
            source_from(&s.source),
            s.provider,
            s.lang,
            s.offset_ms,
            duration,
            Some(kind_from(&s.kind)),
        )
    }))
}

/// Cadeia do ADR-04, parando no primeiro sucesso: cache → tags → sidecar.
///
/// `allow_network` ainda não faz nada além de sinalizar à UI que a busca online
/// seria a próxima etapa; o provedor entra no PR seguinte.
#[tauri::command]
pub fn lyrics_resolve(db: State<Db>, track_id: i64, allow_network: bool) -> AppResult<LyricsResolution> {
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let (file_path, duration) = track_row(&conn, track_id)?;

    // 1. Cache: o que já foi resolvido (ou editado à mão) manda.
    if let Some(s) = load_stored(&conn, track_id) {
        let lyrics = build(
            track_id, &s.content, source_from(&s.source), s.provider, s.lang, s.offset_ms,
            duration, Some(kind_from(&s.kind)),
        );
        return Ok(LyricsResolution {
            lyrics: Some(lyrics),
            resolved_from: "cache".into(),
            network_skipped: false,
        });
    }

    let path = PathBuf::from(&file_path);

    // 2. Tags embutidas no próprio arquivo.
    if let Some(content) = read_embedded(&path) {
        let parsed = svc::parse(&content, 0);
        save(&conn, track_id, LyricsSource::Embedded, None, None, parsed.kind, &content, None, 0, false)?;
        let lyrics = build(track_id, &content, LyricsSource::Embedded, None, None, 0, duration, None);
        return Ok(LyricsResolution {
            lyrics: Some(lyrics),
            resolved_from: "embedded".into(),
            network_skipped: false,
        });
    }

    // 3. Arquivo .lrc ao lado do áudio.
    if let Some(content) = read_sidecar(&path) {
        let parsed = svc::parse(&content, 0);
        save(&conn, track_id, LyricsSource::Sidecar, None, None, parsed.kind, &content, None, 0, false)?;
        let lyrics = build(track_id, &content, LyricsSource::Sidecar, None, None, 0, duration, None);
        return Ok(LyricsResolution {
            lyrics: Some(lyrics),
            resolved_from: "sidecar".into(),
            network_skipped: false,
        });
    }

    // 4. Provedor online — PR seguinte. Até lá, dizer à UI que existe um passo
    //    a mais é o que permite mostrar o CTA certo em vez de "não encontrada".
    Ok(LyricsResolution {
        lyrics: None,
        resolved_from: "none".into(),
        network_skipped: !allow_network,
    })
}

/// Letra colada ou editada pela pessoa. Vence qualquer outra origem.
#[tauri::command]
pub fn lyrics_set_manual(db: State<Db>, track_id: i64, content: String) -> AppResult<Lyrics> {
    if content.trim().is_empty() {
        return Err(AppError::Lyrics("A letra está vazia.".into()));
    }
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let (_, duration) = track_row(&conn, track_id)?;
    let parsed = svc::parse(&content, 0);
    save(&conn, track_id, LyricsSource::Manual, None, None, parsed.kind, &content, None, 0, false)?;
    Ok(build(track_id, &content, LyricsSource::Manual, None, None, 0, duration, None))
}

/// Calibração fina da sincronia, por faixa.
#[tauri::command]
pub fn lyrics_set_offset(db: State<Db>, track_id: i64, offset_ms: i64) -> AppResult<Lyrics> {
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let (_, duration) = track_row(&conn, track_id)?;
    let stored = load_stored(&conn, track_id)
        .ok_or_else(|| AppError::Lyrics("Esta faixa ainda não tem letra para ajustar.".into()))?;

    // Limite generoso, só para barrar valor absurdo vindo de um campo digitado.
    let offset_ms = offset_ms.clamp(-60_000, 60_000);
    conn.execute(
        "UPDATE lyrics SET offset_ms = ?2, updated_at = ?3 WHERE track_id = ?1",
        rusqlite::params![track_id, offset_ms, now_secs()],
    )?;

    Ok(build(
        track_id,
        &stored.content,
        source_from(&stored.source),
        stored.provider,
        stored.lang,
        offset_ms,
        duration,
        Some(kind_from(&stored.kind)),
    ))
}

#[tauri::command]
pub fn lyrics_delete(db: State<Db>, track_id: i64) -> AppResult<()> {
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    conn.execute("DELETE FROM lyrics WHERE track_id = ?1", [track_id])?;
    conn.execute("DELETE FROM lyrics_misses WHERE track_id = ?1", [track_id])?;
    Ok(())
}

/// Grava um `.lrc` ao lado do arquivo de áudio. Opcional e desmarcado por
/// padrão na UI — letra de terceiro não deve ser redistribuída sem intenção.
#[tauri::command]
pub fn lyrics_write_sidecar(db: State<Db>, track_id: i64) -> AppResult<String> {
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let (file_path, _) = track_row(&conn, track_id)?;
    let stored = load_stored(&conn, track_id)
        .ok_or_else(|| AppError::Lyrics("Esta faixa não tem letra para salvar.".into()))?;

    let target = PathBuf::from(&file_path).with_extension("lrc");
    std::fs::write(&target, &stored.content).map_err(|e| {
        AppError::Lyrics(format!("Não foi possível gravar {}: {e}", target.display()))
    })?;
    Ok(target.to_string_lossy().to_string())
}

/// Grava a letra nas tags do próprio arquivo (USLT/©lyr/LYRICS), para ela
/// viajar junto quando a música for copiada para outro aparelho.
#[tauri::command]
pub fn lyrics_embed_tags(db: State<Db>, track_id: i64) -> AppResult<()> {
    use lofty::config::WriteOptions;
    use lofty::tag::{Tag, TagExt};

    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let (file_path, _) = track_row(&conn, track_id)?;
    let stored = load_stored(&conn, track_id)
        .ok_or_else(|| AppError::Lyrics("Esta faixa não tem letra para gravar.".into()))?;

    let path = Path::new(&file_path);
    let mut tagged = lofty::read_from_path(path)
        .map_err(|e| AppError::Lyrics(format!("Não foi possível ler {}: {e}", path.display())))?;

    if tagged.primary_tag_mut().is_none() {
        let tt = tagged.primary_tag_type();
        tagged.insert_tag(Tag::new(tt));
    }
    let tag = tagged
        .primary_tag_mut()
        .ok_or_else(|| AppError::Lyrics("Este formato de arquivo não aceita letra nas tags.".into()))?;

    tag.insert_text(ItemKey::Lyrics, stored.content.clone());
    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| AppError::Lyrics(format!("Não foi possível gravar a letra em {}: {e}", path.display())))?;
    Ok(())
}

/// Quais faixas já têm letra, e de que tipo — a Biblioteca usa isto para o
/// ícone de status sem precisar carregar a letra de cada uma.
#[tauri::command]
pub fn lyrics_status(db: State<Db>, track_ids: Vec<i64>) -> AppResult<Vec<(i64, String)>> {
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let mut stmt = conn.prepare("SELECT kind FROM lyrics WHERE track_id = ?1")?;
    let mut out = Vec::with_capacity(track_ids.len());
    for id in track_ids {
        if let Ok(kind) = stmt.query_row([id], |r| r.get::<_, String>(0)) {
            out.push((id, kind));
        }
    }
    Ok(out)
}
