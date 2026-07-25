//! DownloadService. Wraps yt-dlp + ffmpeg (RF-09 by link, RF-10 direct/search).
//! F0 only builds the argument lists and documents the flow; wiring the spawn
//! + stdout progress parsing to the Tauri shell plugin happens in F4.

/// Job kind decided from the user input.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum JobKind {
    Video,
    Playlist,
    Search,
}

/// Build the yt-dlp arguments for an audio download with embedded cover + tags.
/// Mirrors the defaults researched for the PRD: m4a, best quality, no re-encode.
pub fn build_ytdlp_args(input: &str, kind: JobKind, out_dir: &str, ffmpeg_dir: &str) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-x".into(),
        "--audio-format".into(), "m4a".into(),
        "--audio-quality".into(), "0".into(),
        "--embed-thumbnail".into(),
        "--embed-metadata".into(),
        "-o".into(), format!("{out_dir}/%(playlist_title)s/%(title)s.%(ext)s"),
        "--newline".into(), // one progress line at a time -> easier to parse
    ];
    if !ffmpeg_dir.is_empty() {
        args.push("--ffmpeg-location".into());
        args.push(ffmpeg_dir.into());
    }
    match kind {
        // `ytsearch1:` lets the user download the top result of a text query (RF-10).
        JobKind::Search => args.push(format!("ytsearch1:{input}")),
        _ => args.push(input.to_string()),
    }
    args
}

/// Heuristic to classify user input as link vs. search query, video vs. playlist.
pub fn classify_input(input: &str) -> JobKind {
    let s = input.trim();
    if s.starts_with("http://") || s.starts_with("https://") {
        if s.contains("list=") || s.contains("/playlist") {
            JobKind::Playlist
        } else {
            JobKind::Video
        }
    } else {
        JobKind::Search
    }
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
        assert_eq!(classify_input("https://y.com/watch?v=1&list=PL"), JobKind::Playlist);
        assert_eq!(classify_input("daft punk one more time"), JobKind::Search);
    }

    #[test]
    fn builds_audio_args() {
        let a = build_ytdlp_args("url", JobKind::Video, "/out", "/ff");
        assert!(a.iter().any(|x| x == "--embed-thumbnail"));
        assert!(a.iter().any(|x| x == "m4a"));
        assert!(a.contains(&"--ffmpeg-location".to_string()));
        assert_eq!(a.last().unwrap(), "url");
    }

    #[test]
    fn search_prefixes_ytsearch_and_skips_empty_ffmpeg() {
        let a = build_ytdlp_args("hello world", JobKind::Search, "/out", "");
        assert_eq!(a.last().unwrap(), "ytsearch1:hello world");
        assert!(!a.contains(&"--ffmpeg-location".to_string()));
    }

    #[test]
    fn db_to_linear_works() {
        assert!((db_to_linear(0.0) - 1.0).abs() < 1e-9);
        let g = db_to_linear(-6.0);
        assert!(g > 0.4 && g < 1.0);
    }
}
