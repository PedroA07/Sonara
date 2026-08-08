//! Comandos de letra (E1). Cobre a cadeia completa do ADR-04: cache no banco,
//! tags embutidas, arquivo `.lrc` ao lado do áudio e, por último, o provedor
//! online — este só quando a pessoa liga a opção em Configurações.
//!
//! `ureq` é síncrono. Todo comando que fala com a rede roda o trecho de rede em
//! `spawn_blocking`; chamá-lo direto travaria o executor e, com ele, a UI.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{
    Lyrics, LyricsBatchProgress, LyricsCandidateDto, LyricsKind, LyricsResolution, LyricsSource,
};
use crate::services::lyrics as svc;
use crate::services::lyrics_provider::{
    duration_matches, miss_expired, LrcLib, LyricsCandidate, LyricsProvider, TrackQuery,
};
use std::collections::HashSet;
use std::sync::Mutex;
use lofty::file::TaggedFileExt;
use lofty::tag::ItemKey;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, State};

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
/// Deliberadamente síncrono e sem rede. A quarta etapa da cadeia — o provedor
/// online — é um comando separado (`lyrics_fetch_online`), chamado pela UI só
/// quando esta aqui volta de mãos vazias. `allow_network` não busca nada: só
/// diz à UI se aquele passo existe, para ela escolher entre "não encontrada" e
/// "a busca online está desligada".
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

// ─────────────────────────── provedor online ───────────────────────────

/// Estado de sessão do provedor.
///
/// `attempted` faz valer o limite de **uma requisição por faixa por sessão**:
/// sem isso, alternar entre a aba Capa e a aba Letra consultaria o serviço a
/// cada volta. `cancel_batch` é o sinal de parada da busca em lote.
#[derive(Default)]
pub struct LyricsNet {
    attempted: Mutex<HashSet<i64>>,
    cancel_batch: std::sync::atomic::AtomicBool,
}

fn provider() -> LrcLib {
    LrcLib
}

/// O que perguntar ao provedor sobre esta faixa.
fn track_query(conn: &rusqlite::Connection, track_id: i64) -> AppResult<TrackQuery> {
    conn.query_row(
        "SELECT t.title, t.duration,
                COALESCE(
                  (SELECT ar.name FROM track_artist ta JOIN artist ar ON ar.id = ta.artist_id
                    WHERE ta.track_id = t.id ORDER BY ar.name LIMIT 1),
                  (SELECT ar2.name FROM album al2 JOIN artist ar2 ON ar2.id = al2.artist_id
                    WHERE al2.id = t.album_id), '') AS artist,
                COALESCE((SELECT al.title FROM album al WHERE al.id = t.album_id), '') AS album
           FROM track t WHERE t.id = ?1",
        [track_id],
        |r| {
            Ok(TrackQuery {
                title: r.get(0)?,
                duration_secs: r.get(1)?,
                artist: r.get(2)?,
                album: r.get(3)?,
            })
        },
    )
    .map_err(|_| AppError::Lyrics(format!("faixa {track_id} não está na biblioteca")))
}

/// Registra que a faixa não tem letra, para não perguntar de novo por 7 dias.
fn record_miss(conn: &rusqlite::Connection, track_id: i64) {
    let _ = conn.execute(
        "INSERT INTO lyrics_misses (track_id, tries, last_try) VALUES (?1, 1, ?2)
         ON CONFLICT(track_id) DO UPDATE SET tries = tries + 1, last_try = ?2",
        rusqlite::params![track_id, now_secs()],
    );
}

/// A faixa está no cache negativo e ainda dentro do prazo?
fn recently_missed(conn: &rusqlite::Connection, track_id: i64) -> bool {
    conn.query_row(
        "SELECT last_try FROM lyrics_misses WHERE track_id = ?1",
        [track_id],
        |r| r.get::<_, i64>(0),
    )
    .map(|last| !miss_expired(last, now_secs()))
    .unwrap_or(false)
}

/// Guarda o resultado do provedor e devolve a letra pronta.
fn apply_candidate(
    conn: &rusqlite::Connection,
    track_id: i64,
    cand: &LyricsCandidate,
    duration: Option<f64>,
) -> AppResult<Lyrics> {
    let (kind, content) = if cand.instrumental {
        (LyricsKind::Instrumental, String::new())
    } else {
        let content = cand
            .best_content()
            .ok_or_else(|| AppError::Lyrics("O resultado veio sem letra.".into()))?
            .to_string();
        (svc::parse(&content, 0).kind, content)
    };

    let provider_name = provider().name();
    save(
        conn,
        track_id,
        LyricsSource::Provider,
        Some(provider_name),
        Some(cand.provider_id.as_str()),
        kind,
        &content,
        None,
        0,
        true,
    )?;
    Ok(build(
        track_id,
        &content,
        LyricsSource::Provider,
        Some(provider_name.to_string()),
        None,
        0,
        duration,
        Some(kind),
    ))
}

/// Busca a letra desta faixa no provedor. Só é chamado quando a resolução
/// local falhou e a pessoa ligou a busca online.
#[tauri::command]
pub async fn lyrics_fetch_online(app: AppHandle, track_id: i64) -> AppResult<LyricsResolution> {
    // Uma tentativa por faixa por sessão.
    {
        let net = app.state::<LyricsNet>();
        let mut seen = net.attempted.lock().map_err(|_| AppError::Other("lock".into()))?;
        if !seen.insert(track_id) {
            return Ok(LyricsResolution {
                lyrics: None,
                resolved_from: "none".into(),
                network_skipped: false,
            });
        }
    }

    let (query, duration, skip) = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
        let (_, duration) = track_row(&conn, track_id)?;
        (track_query(&conn, track_id)?, duration, recently_missed(&conn, track_id))
    };

    if skip {
        return Ok(LyricsResolution {
            lyrics: None,
            resolved_from: "none".into(),
            network_skipped: false,
        });
    }

    // ureq é blocking: sai do executor async, senão a UI congela.
    let q = query.clone();
    let found = tauri::async_runtime::spawn_blocking(move || provider().lookup(&q))
        .await
        .map_err(|e| AppError::Lyrics(e.to_string()))??;

    let db = app.state::<Db>();
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;

    match found {
        // Só aplica sozinho quando a duração confirma que é a mesma gravação.
        Some(cand) if duration_matches(query.duration_secs, cand.duration_sec) => {
            let lyrics = apply_candidate(&conn, track_id, &cand, duration)?;
            Ok(LyricsResolution {
                lyrics: Some(lyrics),
                resolved_from: "provider".into(),
                network_skipped: false,
            })
        }
        _ => {
            record_miss(&conn, track_id);
            Ok(LyricsResolution {
                lyrics: None,
                resolved_from: "none".into(),
                network_skipped: false,
            })
        }
    }
}

/// Busca ampla, para a pessoa escolher à mão quando a automática não achou.
#[tauri::command]
pub async fn lyrics_search(query: String) -> AppResult<Vec<LyricsCandidateDto>> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let found = tauri::async_runtime::spawn_blocking(move || provider().search(&q))
        .await
        .map_err(|e| AppError::Lyrics(e.to_string()))??;

    Ok(found
        .into_iter()
        .map(|c| LyricsCandidateDto {
            provider_id: c.provider_id,
            track_name: c.track_name,
            artist_name: c.artist_name,
            album_name: c.album_name,
            duration_sec: c.duration_sec,
            has_synced: c.has_synced,
            instrumental: c.instrumental,
        })
        .collect())
}

/// Aplica um candidato escolhido à mão. Aqui não há checagem de duração — a
/// escolha é da pessoa, e ela viu título, artista e duração antes de decidir.
#[tauri::command]
pub async fn lyrics_apply_candidate(
    app: AppHandle,
    track_id: i64,
    query: String,
    provider_id: String,
) -> AppResult<Lyrics> {
    let q = query.trim().to_string();
    let found = tauri::async_runtime::spawn_blocking(move || provider().search(&q))
        .await
        .map_err(|e| AppError::Lyrics(e.to_string()))??;

    let cand = found
        .into_iter()
        .find(|c| c.provider_id == provider_id)
        .ok_or_else(|| AppError::Lyrics("Esse resultado não está mais disponível.".into()))?;

    let db = app.state::<Db>();
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let (_, duration) = track_row(&conn, track_id)?;
    apply_candidate(&conn, track_id, &cand, duration)
}

/// Quantidade de trabalhadores da busca em lote.
///
/// Dois, não `join_all`: o serviço é gratuito e público, e disparar 200
/// requisições de uma vez é a forma mais rápida de ser bloqueado.
const BATCH_WORKERS: usize = 2;

/// Busca letra para várias faixas, com progresso e cancelamento.
///
/// A rede é consultada só se `lyrics_provider_enabled` estiver ligada. Com ela
/// desligada o lote ainda vale a pena: lê as letras que já estão dentro dos
/// arquivos e os `.lrc` ao lado deles, sem sair do computador.
#[tauri::command]
pub async fn lyrics_fetch_batch(app: AppHandle, track_ids: Vec<i64>) -> AppResult<usize> {
    app.state::<LyricsNet>()
        .cancel_batch
        .store(false, std::sync::atomic::Ordering::Relaxed);

    let allow_network = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
        flag(&conn, "lyrics_provider_enabled")
    };

    let total = track_ids.len();
    let queue = std::sync::Arc::new(Mutex::new(track_ids));
    let done = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let found = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));

    let mut workers = Vec::with_capacity(BATCH_WORKERS);
    for _ in 0..BATCH_WORKERS {
        let app = app.clone();
        let queue = queue.clone();
        let done = done.clone();
        let found = found.clone();

        workers.push(tauri::async_runtime::spawn(async move {
            loop {
                if app
                    .state::<LyricsNet>()
                    .cancel_batch
                    .load(std::sync::atomic::Ordering::Relaxed)
                {
                    break;
                }
                let next = match queue.lock() {
                    Ok(mut q) => q.pop(),
                    Err(_) => None,
                };
                let Some(track_id) = next else { break };

                let title = {
                    let db = app.state::<Db>();
                    db.0.lock()
                        .ok()
                        .and_then(|c| track_query(&c, track_id).ok())
                        .map(|q| q.title)
                        .unwrap_or_default()
                };

                if resolve_or_fetch(&app, track_id, allow_network).await {
                    found.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                }
                let d = done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;

                let _ = app.emit(
                    "lyrics-batch-progress",
                    LyricsBatchProgress {
                        done: d,
                        total,
                        found: found.load(std::sync::atomic::Ordering::Relaxed),
                        title,
                        finished: d >= total,
                    },
                );
            }
        }));
    }

    for w in workers {
        let _ = w.await;
    }

    // Evento final incondicional. Cancelamento e lista vazia nunca chegam a
    // `done == total`, e sem isto a barra de progresso ficaria presa na tela.
    let found = found.load(std::sync::atomic::Ordering::Relaxed);
    let _ = app.emit(
        "lyrics-batch-progress",
        LyricsBatchProgress {
            done: done.load(std::sync::atomic::Ordering::Relaxed),
            total,
            found,
            title: String::new(),
            finished: true,
        },
    );
    if found > 0 {
        let _ = app.emit("lyrics-changed", ());
    }
    Ok(found)
}

/// Uma configuração booleana do banco, com `false` como padrão seguro: se a
/// leitura falhar, o comportamento é o de opção desligada, não o contrário.
fn flag(conn: &rusqlite::Connection, key: &str) -> bool {
    conn.query_row("SELECT value FROM setting WHERE key = ?1", [key], |r| {
        r.get::<_, String>(0)
    })
    .map(|v| v == "true")
    .unwrap_or(false)
}

/// Cadeia inteira numa chamada só: origens locais e, se elas falharem e a rede
/// estiver autorizada, o provedor.
///
/// Existe porque tanto a busca em lote quanto a automática pós-download
/// percorrem faixas que podem já ter letra embutida ou `.lrc` ao lado. Ir
/// direto ao `lyrics_fetch_online` gastaria uma requisição para descobrir algo
/// que estava no disco.
async fn resolve_or_fetch(app: &AppHandle, track_id: i64, allow_network: bool) -> bool {
    match lyrics_resolve(app.state::<Db>(), track_id, allow_network) {
        Ok(res) if res.lyrics.is_some() => return true,
        Ok(_) => {}
        Err(_) => return false, // faixa some da biblioteca no meio do lote
    }
    if !allow_network {
        return false;
    }
    lyrics_fetch_online(app.clone(), track_id)
        .await
        .is_ok_and(|r| r.lyrics.is_some())
}

/// Procura a letra logo depois de um download terminar.
///
/// Depende de **duas** opções ligadas: a busca automática e a busca online. A
/// automática sozinha não autoriza nada — quem decide se a rede é usada é
/// `lyrics_provider_enabled`, e essa é opt-in.
///
/// Roda depois do job já ter sido marcado como concluído, então qualquer falha
/// aqui é silenciosa: o download continua válido mesmo sem letra.
pub async fn auto_fetch_after_download(app: &AppHandle, track_id: i64) {
    let (auto, online) = {
        let db = app.state::<Db>();
        let Ok(conn) = db.0.lock() else { return };
        (
            flag(&conn, "lyrics_auto_fetch_on_download"),
            flag(&conn, "lyrics_provider_enabled"),
        )
    };
    if !auto || !online {
        return;
    }
    if resolve_or_fetch(app, track_id, true).await {
        let _ = app.emit("lyrics-changed", track_id);
    }
}

#[tauri::command]
pub fn lyrics_cancel_batch(app: AppHandle) {
    app.state::<LyricsNet>()
        .cancel_batch
        .store(true, std::sync::atomic::Ordering::Relaxed);
}

/// "Procurar letra de novo": limpa o cache negativo e o limite de sessão.
#[tauri::command]
pub fn lyrics_forget_miss(app: AppHandle, track_id: i64) -> AppResult<()> {
    if let Ok(mut seen) = app.state::<LyricsNet>().attempted.lock() {
        seen.remove(&track_id);
    }
    let db = app.state::<Db>();
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    conn.execute("DELETE FROM lyrics_misses WHERE track_id = ?1", [track_id])?;
    Ok(())
}
