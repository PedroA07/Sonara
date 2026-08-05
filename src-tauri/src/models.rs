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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    pub id: i64,
    pub title: String,
    pub year: Option<i64>,
    pub cover_path: Option<String>,
    pub artist_id: Option<i64>,
    pub genre: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
    pub sort_mode: String,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub copied: usize,
    pub skipped: usize,
    pub failed: usize,
    pub dest_dir: String,
    pub errors: Vec<String>,
}
