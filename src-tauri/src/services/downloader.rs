//! DownloadService. Wraps yt-dlp + ffmpeg (RF-09 by link, RF-10 direct/search).
//!
//! Everything in this module is a *pure* function so the argument list and the
//! stdout parsing can be unit-tested without spawning a process. The spawning
//! itself lives in `commands/download.rs`.

use std::path::{Path, PathBuf};

/// Marker printed by yt-dlp (`--print`) before the final file path. Without it
/// we cannot tell a path apart from any other stdout line.
pub const FILE_MARKER: &str = "@@SONARA_FILE@@";
/// Marker prefixed to every progress line (`--progress-template`).
pub const PROGRESS_MARKER: &str = "@@SONARA_PROGRESS@@";

/// Job kind decided from the user input.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum JobKind {
    /// A single track: either a plain video URL, or a video inside a playlist
    /// (`watch?v=…&list=…`) — in that case only the video itself is wanted.
    Video,
    /// A real playlist URL, where every entry should be downloaded.
    Playlist,
    /// Free text: resolved through `ytsearch1:`.
    Search,
}

/// Audio container the user picked in Settings. `m4a` keeps the original AAC
/// stream (no re-encode, best quality); `mp3` is the most compatible option for
/// car stereos and older devices; `opus` is the smallest; `flac` is lossless
/// (transcoded from a lossy source, so it is offered but not recommended).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AudioFormat {
    M4a,
    Mp3,
    Opus,
    Flac,
}

impl AudioFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            AudioFormat::M4a => "m4a",
            AudioFormat::Mp3 => "mp3",
            AudioFormat::Opus => "opus",
            AudioFormat::Flac => "flac",
        }
    }

    /// Parse the value stored in `setting`. Unknown values fall back to m4a.
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "mp3" => AudioFormat::Mp3,
            "opus" => AudioFormat::Opus,
            "flac" => AudioFormat::Flac,
            _ => AudioFormat::M4a,
        }
    }

    /// `--embed-thumbnail` only works for containers that can carry a picture
    /// frame. Asking for it on opus/flac makes yt-dlp abort the whole job.
    pub fn supports_thumbnail(self) -> bool {
        matches!(self, AudioFormat::M4a | AudioFormat::Mp3 | AudioFormat::Flac)
    }
}

/// Build the yt-dlp arguments for an audio download with embedded cover + tags.
///
/// Three details here are what make downloads actually work, and each of them
/// was broken before:
///
/// 1. `--print` implies `--quiet`, which silences the `[download] 12.3%` lines.
///    `--progress --progress-template` forces machine-readable progress back on.
/// 2. The final path is printed behind [`FILE_MARKER`] instead of being guessed
///    from "does this stdout line happen to be an existing path?".
/// 3. `--no-playlist` / `--yes-playlist` is stated explicitly, so a shared
///    `watch?v=…&list=RD…` link downloads one song instead of a 50-track radio.
pub fn build_ytdlp_args(
    input: &str,
    kind: JobKind,
    out_dir: &str,
    ffmpeg_dir: &str,
    format: AudioFormat,
) -> Vec<String> {
    // Playlists get their own folder + index prefix; single tracks land flat in
    // the download folder (the old template created a literal "NA" folder).
    let template = match kind {
        JobKind::Playlist => {
            format!("{out_dir}/%(playlist_title,playlist_id|Playlist)s/%(playlist_index)02d - %(title)s.%(ext)s")
        }
        _ => format!("{out_dir}/%(title)s.%(ext)s"),
    };

    let mut args: Vec<String> = vec![
        "--extract-audio".into(),
        "--audio-format".into(), format.as_str().into(),
        "--audio-quality".into(), "0".into(),
        "--embed-metadata".into(),
        "--add-metadata".into(),
        // Windows/exFAT-safe names — a "?" or ":" in a video title silently
        // failed the write on Windows and on USB sticks.
        "--windows-filenames".into(),
        "--trim-filenames".into(), "180".into(),
        "--no-mtime".into(),
        "--no-overwrites".into(),
        "--no-color".into(),
        "--newline".into(),
        // Keep going when one entry of a playlist is unavailable.
        "--ignore-errors".into(),
        "--retries".into(), "5".into(),
        "--fragment-retries".into(), "5".into(),
        "--socket-timeout".into(), "30".into(),
        "-o".into(), template,
    ];

    if format.supports_thumbnail() {
        args.push("--embed-thumbnail".into());
    }

    match kind {
        JobKind::Playlist => args.push("--yes-playlist".into()),
        _ => args.push("--no-playlist".into()),
    }

    if !ffmpeg_dir.is_empty() {
        args.push("--ffmpeg-location".into());
        args.push(ffmpeg_dir.into());
    }

    // Progress: forced on (see doc comment) and emitted in a fixed shape we own.
    args.push("--progress".into());
    args.push("--progress-template".into());
    args.push(format!(
        "download:{PROGRESS_MARKER}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.title)s"
    ));

    // Final file path, printed once per entry after post-processing moved it.
    args.push("--no-simulate".into());
    args.push("--print".into());
    args.push(format!("after_move:{FILE_MARKER}%(filepath)s"));

    match kind {
        // `ytsearch1:` lets the user download the top result of a text query (RF-10).
        JobKind::Search => args.push(format!("ytsearch1:{input}")),
        _ => args.push(input.to_string()),
    }
    args
}

/// Heuristic to classify user input as link vs. search query, video vs. playlist.
///
/// A URL that carries **both** `v=` and `list=` is the "playing from a playlist"
/// share link: the user wants that one song, not the whole radio mix.
pub fn classify_input(input: &str) -> JobKind {
    let s = input.trim();
    if !(s.starts_with("http://") || s.starts_with("https://")) {
        return JobKind::Search;
    }
    let is_watch = s.contains("watch?v=") || s.contains("&v=") || s.contains("youtu.be/") || s.contains("/shorts/");
    let has_list = s.contains("list=") || s.contains("/playlist");
    if has_list && !is_watch {
        JobKind::Playlist
    } else {
        JobKind::Video
    }
}

/// One parsed progress line (see [`PROGRESS_MARKER`]).
#[derive(Debug, Clone, PartialEq)]
pub struct ProgressLine {
    pub percent: f64,
    pub speed: String,
    pub eta: String,
    pub title: String,
}

/// Parse `@@SONARA_PROGRESS@@ 12.3%| 1.20MiB/s|00:12|Some title`.
pub fn parse_progress(line: &str) -> Option<ProgressLine> {
    let rest = line.trim().strip_prefix(PROGRESS_MARKER)?;
    let mut parts = rest.split('|');
    let percent = parse_percent(parts.next()?.trim())?;
    let clean = |s: Option<&str>| s.unwrap_or("").trim().trim_matches('"').to_string();
    let speed = clean(parts.next());
    let eta = clean(parts.next());
    // The title itself may contain "|", so take everything that is left.
    let title = parts.collect::<Vec<_>>().join("|").trim().to_string();
    Some(ProgressLine {
        percent,
        speed: if speed == "N/A" || speed == "Unknown" { String::new() } else { speed },
        eta: if eta == "N/A" || eta == "Unknown" { String::new() } else { eta },
        title,
    })
}

/// Parse a yt-dlp percentage token such as `" 12.3%"` into `12.3`.
pub fn parse_percent(text: &str) -> Option<f64> {
    let idx = text.find('%')?;
    let head = &text[..idx];
    let rev: String = head
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    let num: String = rev.chars().rev().collect();
    let v: f64 = num.trim().parse().ok()?;
    if v.is_finite() { Some(v.clamp(0.0, 100.0)) } else { None }
}

/// Extract the final file path from a `--print` line.
pub fn parse_file_line(line: &str) -> Option<String> {
    let p = line.trim().strip_prefix(FILE_MARKER)?.trim();
    if p.is_empty() || p == "NA" { None } else { Some(p.to_string()) }
}

/// Turn a raw yt-dlp/stderr failure into something a person can act on.
/// Returning Portuguese here keeps the whole UI in one language.
pub fn friendly_error(raw: &str, code: i32) -> String {
    let l = raw.to_ascii_lowercase();
    let hint = if l.contains("ffmpeg") || l.contains("ffprobe") {
        "O ffmpeg não foi encontrado. Reinstale o Sonara — ele acompanha o app."
    } else if l.contains("sign in to confirm") || l.contains("age") && l.contains("restrict") {
        "Este vídeo exige login (restrição de idade). Tente outra versão da música."
    } else if l.contains("private video") {
        "Este vídeo é privado e não pode ser baixado."
    } else if l.contains("video unavailable") || l.contains("not available") {
        "Vídeo indisponível no seu país ou removido. Tente outro resultado."
    } else if l.contains("unable to download") || l.contains("temporary failure")
        || l.contains("network") || l.contains("timed out") || l.contains("connection")
        || l.contains("getaddrinfo") || l.contains("resolve")
    {
        "Falha de conexão. Verifique a internet e tente novamente."
    } else if l.contains("http error 429") || l.contains("too many requests") {
        "O YouTube limitou temporariamente os downloads. Aguarde alguns minutos."
    } else if l.contains("unsupported url") || l.contains("is not a valid url") {
        "Link não suportado. Cole um link do YouTube ou pesquise pelo nome."
    } else if l.contains("permission denied") || l.contains("access is denied") || l.contains("os error 13") {
        "Sem permissão para gravar na pasta de downloads. Escolha outra pasta em Configurações."
    } else if l.contains("no space left") || l.contains("os error 28") {
        "Sem espaço em disco na pasta de downloads."
    } else if raw.trim().is_empty() {
        return format!("O download falhou (código {code}). Tente novamente.");
    } else {
        return trim_raw(raw);
    };
    hint.to_string()
}

/// Keep raw errors short enough to fit a toast without losing the useful part.
fn trim_raw(raw: &str) -> String {
    let one = raw.replace('\n', " ");
    let cleaned = one.trim().trim_start_matches("ERROR:").trim();
    if cleaned.chars().count() > 220 {
        let short: String = cleaned.chars().take(217).collect();
        format!("{short}…")
    } else {
        cleaned.to_string()
    }
}

/// Locate a bundled sidecar binary by name.
///
/// Tauri copies `externalBin` next to the main executable (and strips the
/// target-triple suffix) both for `tauri dev` and for every bundle format. The
/// old code looked in `resource_dir()`, which is only the same folder on
/// Windows — on macOS (`Contents/Resources` vs `Contents/MacOS`) and on Linux
/// it pointed at a directory with no ffmpeg in it, so every extraction failed.
pub fn sidecar_path(exe_dir: &Path, name: &str) -> Option<PathBuf> {
    let exe = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    let candidates = [
        exe_dir.join(&exe),
        // macOS .app: Contents/MacOS/<bin> when called from Contents/Resources.
        exe_dir.join("../MacOS").join(&exe),
        // `cargo run` from src-tauri, before the sidecars are copied.
        exe_dir.join("../../binaries").join(&exe),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

/// Convert a ReplayGain dB value to a linear volume multiplier. Pure → tested.
pub fn db_to_linear(db: f64) -> f64 {
    10f64.powf(db / 20.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_input() {
        assert_eq!(classify_input("https://youtube.com/watch?v=x"), JobKind::Video);
        assert_eq!(classify_input("https://youtube.com/playlist?list=abc"), JobKind::Playlist);
        assert_eq!(classify_input("daft punk one more time"), JobKind::Search);
    }

    #[test]
    fn a_video_shared_from_a_playlist_is_not_a_playlist() {
        // Regression: this used to queue the whole radio mix.
        assert_eq!(classify_input("https://youtube.com/watch?v=1&list=RDabc"), JobKind::Video);
        assert_eq!(classify_input("https://youtu.be/abc?list=PL123"), JobKind::Video);
    }

    #[test]
    fn builds_audio_args() {
        let a = build_ytdlp_args("url", JobKind::Video, "/out", "/ff", AudioFormat::M4a);
        assert!(a.iter().any(|x| x == "--embed-thumbnail"));
        assert!(a.iter().any(|x| x == "m4a"));
        assert!(a.contains(&"--ffmpeg-location".to_string()));
        assert!(a.contains(&"--no-playlist".to_string()));
        assert_eq!(a.last().unwrap(), "url");
    }

    #[test]
    fn forces_progress_even_though_print_implies_quiet() {
        let a = build_ytdlp_args("url", JobKind::Video, "/out", "", AudioFormat::M4a);
        assert!(a.contains(&"--progress".to_string()));
        assert!(a.iter().any(|x| x.contains(PROGRESS_MARKER)));
        assert!(a.iter().any(|x| x.contains(FILE_MARKER)));
    }

    #[test]
    fn single_track_template_has_no_playlist_folder() {
        let a = build_ytdlp_args("url", JobKind::Video, "/out", "", AudioFormat::M4a);
        let tpl = a.iter().find(|x| x.starts_with("/out")).unwrap();
        assert_eq!(tpl, "/out/%(title)s.%(ext)s");

        let p = build_ytdlp_args("url", JobKind::Playlist, "/out", "", AudioFormat::M4a);
        assert!(p.iter().any(|x| x.contains("%(playlist_index)02d")));
        assert!(p.contains(&"--yes-playlist".to_string()));
    }

    #[test]
    fn opus_skips_the_unsupported_thumbnail_flag() {
        let a = build_ytdlp_args("url", JobKind::Video, "/out", "", AudioFormat::Opus);
        assert!(!a.iter().any(|x| x == "--embed-thumbnail"));
        assert!(a.iter().any(|x| x == "opus"));
    }

    #[test]
    fn search_prefixes_ytsearch_and_skips_empty_ffmpeg() {
        let a = build_ytdlp_args("hello world", JobKind::Search, "/out", "", AudioFormat::M4a);
        assert_eq!(a.last().unwrap(), "ytsearch1:hello world");
        assert!(!a.contains(&"--ffmpeg-location".to_string()));
    }

    #[test]
    fn parses_percent() {
        assert_eq!(parse_percent("[download]  12.3% of 4.5MiB"), Some(12.3));
        assert_eq!(parse_percent("100%"), Some(100.0));
        assert_eq!(parse_percent("nothing here"), None);
    }

    #[test]
    fn parses_progress_lines() {
        let p = parse_progress(&format!("{PROGRESS_MARKER}  12.3%|  1.20MiB/s|00:12|Uma música")).unwrap();
        assert_eq!(p.percent, 12.3);
        assert_eq!(p.speed, "1.20MiB/s");
        assert_eq!(p.eta, "00:12");
        assert_eq!(p.title, "Uma música");
        assert!(parse_progress("[download] 12%").is_none());
    }

    #[test]
    fn progress_hides_unknown_speed_and_eta() {
        let p = parse_progress(&format!("{PROGRESS_MARKER}0.0%|N/A|Unknown|X")).unwrap();
        assert!(p.speed.is_empty() && p.eta.is_empty());
    }

    #[test]
    fn parses_file_lines() {
        assert_eq!(parse_file_line(&format!("{FILE_MARKER}/tmp/a.m4a")), Some("/tmp/a.m4a".into()));
        assert_eq!(parse_file_line(&format!("{FILE_MARKER}NA")), None);
        assert_eq!(parse_file_line("/tmp/a.m4a"), None);
    }

    #[test]
    fn friendly_errors_are_actionable() {
        assert!(friendly_error("ERROR: ffmpeg not found", 1).contains("ffmpeg"));
        assert!(friendly_error("ERROR: Private video", 1).contains("privado"));
        assert!(friendly_error("ERROR: unable to download: Temporary failure", 1).contains("conexão"));
        assert!(friendly_error("", 2).contains("código 2"));
        // Unknown errors are passed through (trimmed), never swallowed.
        assert_eq!(friendly_error("ERROR: something odd", 1), "something odd");
    }

    #[test]
    fn audio_format_round_trips() {
        assert_eq!(AudioFormat::parse("MP3").as_str(), "mp3");
        assert_eq!(AudioFormat::parse("banana").as_str(), "m4a");
        assert!(!AudioFormat::parse("opus").supports_thumbnail());
    }

    #[test]
    fn db_to_linear_works() {
        assert!((db_to_linear(0.0) - 1.0).abs() < 1e-9);
        let g = db_to_linear(-6.0);
        assert!(g > 0.4 && g < 1.0);
    }
}
