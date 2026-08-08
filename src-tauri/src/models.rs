use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: i64,
    pub title: String,
    pub file_path: String,
    pub duration: Option<f64>,
    pub track_no: Option<i64>,
    pub disc_no: Option<i64>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub album_id: Option<i64>,
    pub bitrate: Option<i64>,
    pub format: Option<String>,
    pub gain: Option<f64>,
    pub cover_path: Option<String>,
    /// Resolved for display: the player and every list show the artist next to
    /// the title instead of the file format.
    pub artist_name: Option<String>,
    pub album_title: Option<String>,
    /// Vídeo baixado para esta faixa (ADR-05). `None` = só áudio, que é o caso
    /// normal; o modo vídeo só aparece para quem baixou.
    pub video_path: Option<String>,
    /// Calibração de lipsync desta faixa, em ms.
    pub video_offset_ms: i64,
}

/// Parsed tags from an audio file (before it is inserted into the library).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ParsedTrack {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album_artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i64>,
    pub track_no: Option<i64>,
    pub disc_no: Option<i64>,
    pub genre: Option<String>,
    pub duration: Option<f64>,
    pub bitrate: Option<i64>,
    pub format: Option<String>,
    pub has_cover: bool,
    pub gain: Option<f64>,
    pub file_path: String,
    /// As tags não puderam ser lidas por inteiro (ID3 malformado, por exemplo).
    /// A faixa entra na biblioteca assim mesmo — some daí é pior —, e a tela de
    /// importação diz quantas vieram nesse estado.
    #[serde(default)]
    pub tags_unreadable: bool,
}

/// Suggestion returned to the UI after scanning a dropped folder (RF-02).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSuggestion {
    pub root_path: String,
    pub pattern: String,   // "artist_album" | "album" | "artist_album_disc" | "flat"
    pub depth: u32,
    pub track_count: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlbumCard {
    pub id: i64,
    pub title: String,
    pub year: Option<i64>,
    pub cover_path: Option<String>,
    pub artist_name: Option<String>,
    pub track_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artist {
    pub id: i64,
    pub name: String,
    pub album_count: i64,
}

/// Optional fields for editing one or more tracks (RF-05).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TrackEdit {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub track_no: Option<i64>,
    pub disc_no: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistCard {
    pub id: i64,
    pub name: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
    pub sort_mode: String,
    pub track_count: i64,
}

/// A candidate cover image (from the iTunes search) shown so the user can
/// preview and pick artwork for a track/album.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverCandidate {
    pub thumb: String, // small preview URL
    pub full: String,  // high-res URL to actually download
    pub label: String, // "Artista — Álbum" for context
}

/// One YouTube search result (RF-10), shown so the user can preview and pick.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub uploader: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadJob {
    pub id: i64,
    pub url: Option<String>,
    #[serde(rename = "type")]
    pub job_type: String,
    pub status: String,
    pub progress: f64,
    pub dest_kind: Option<String>,
    pub dest_id: Option<i64>,
    /// Filled in from the video title as soon as yt-dlp reports it, so the
    /// history reads like a track list instead of a list of URLs.
    pub title: Option<String>,
    pub file_path: Option<String>,
    pub error: Option<String>,
    pub track_id: Option<i64>,
    pub created_at: Option<String>,
}

/// Health of the bundled download tools, surfaced in Settings so a failure is
/// self-explanatory instead of "nothing happens".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStatus {
    pub ytdlp_version: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub download_dir: String,
    pub download_dir_writable: bool,
    pub audio_format: String,
}

/// How to lay out an export (see `commands/export.rs`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub dest_dir: String,
    /// "flat" | "artist" | "artist_album"
    pub organize: String,
    /// "title" | "artist_title" | "track_title"
    pub naming: String,
    /// Re-encode to MP3 for players that don't read m4a/opus.
    pub convert_mp3: bool,
    pub overwrite: bool,
    /// Also write an .m3u8 playlist next to the exported files.
    pub playlist_file: bool,
    pub playlist_name: Option<String>,
    /// Write the track's lyrics as a `.lrc` next to each exported file.
    /// Off by default: lyrics fetched from a provider are not ours to
    /// redistribute, so copying them onto another device is a deliberate act.
    #[serde(default)]
    pub include_lrc: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub copied: usize,
    pub skipped: usize,
    pub failed: usize,
    pub dest_dir: String,
    pub errors: Vec<String>,
}

// ─────────────────────────── Letras (0006) ───────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LyricsKind {
    /// Tem tempo por linha — a letra rola sozinha.
    Synced,
    /// Só texto, sem tempo.
    Plain,
    /// A faixa é declaradamente instrumental; ausência de letra não é erro.
    Instrumental,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LyricsSource {
    /// Tags dentro do próprio arquivo de áudio (SYLT/USLT/©lyr/LYRICS).
    Embedded,
    /// Arquivo `.lrc` (ou `.txt`) com o mesmo nome do áudio.
    Sidecar,
    /// Provedor online.
    Provider,
    /// Colada ou editada pela pessoa.
    Manual,
}

/// Uma palavra com tempo próprio (LRC "enhanced").
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricWord {
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    pub index: i64,
    pub start_ms: i64,
    /// Início da linha seguinte (ou o fim da faixa, na última).
    pub end_ms: i64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<LyricWord>>,
    pub is_chorus: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chorus_id: Option<i64>,
    /// Trecho instrumental: linha vazia no arquivo ou vão longo entre falas.
    pub is_gap: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub track_id: i64,
    pub kind: LyricsKind,
    pub source: LyricsSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    /// Calibração da pessoa, em ms. Já aplicada em `lines`.
    pub offset_ms: i64,
    pub lines: Vec<LyricLine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plain_text: Option<String>,
}

/// O que aconteceu ao rodar a cadeia de resolução — a UI usa isto para
/// escolher entre "achei", "não achei" e "não procurei online".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResolution {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<Lyrics>,
    /// "embedded" | "sidecar" | "cache" | "provider" | "none"
    pub resolved_from: String,
    /// Verdadeiro quando a busca online existiria, mas está desligada.
    pub network_skipped: bool,
}

/// Um resultado do provedor, exposto à UI para a pessoa escolher.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsCandidateDto {
    pub provider_id: String,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: Option<String>,
    pub duration_sec: f64,
    pub has_synced: bool,
    pub instrumental: bool,
}

// ─────────────────────────── Vídeo (0007) ───────────────────────────

/// O que o yt-dlp responde sobre o vídeo *antes* de baixar, para o CTA poder
/// dizer "Baixar vídeo (~78 MB)" em vez de pedir um cheque em branco.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoProbe {
    pub track_id: i64,
    /// URL do vídeo ou a consulta `ytsearch1:` que será usada.
    pub source_url: String,
    /// Ausente quando o YouTube não informa o tamanho do formato escolhido.
    pub size_bytes: Option<i64>,
    pub height: Option<i64>,
    pub title: String,
    /// Qualidade que será usada ("720p" | "1080p" | "max"), para o CTA poder
    /// dizer o que vai baixar em vez de só quanto ocupa.
    pub quality: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStorageItem {
    pub track_id: i64,
    pub title: String,
    pub path: String,
    pub bytes: i64,
    pub height: Option<i64>,
    /// O registro existe mas o arquivo não está mais no disco.
    pub missing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStorage {
    pub total_bytes: i64,
    pub items: Vec<VideoStorageItem>,
}

/// Andamento da busca de letras em lote.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsBatchProgress {
    pub done: usize,
    pub total: usize,
    pub found: usize,
    pub title: String,
    pub finished: bool,
}
