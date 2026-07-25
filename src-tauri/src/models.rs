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
}
