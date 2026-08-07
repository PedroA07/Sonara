export interface Track {
  id: number;
  title: string;
  file_path: string;
  duration: number | null;
  track_no: number | null;
  disc_no: number | null;
  year: number | null;
  genre: string | null;
  album_id: number | null;
  bitrate: number | null;
  format: string | null;
  gain: number | null;
  cover_path: string | null;
  /** Resolved by the backend for display (never edited through this shape). */
  artist_name: string | null;
  album_title: string | null;
}

export interface AlbumCard {
  id: number;
  title: string;
  year: number | null;
  cover_path: string | null;
  artist_name: string | null;
  track_count: number;
}

export interface Artist {
  id: number;
  name: string;
  album_count: number;
}

export interface ParsedTrack {
  title: string | null;
  artist: string | null;
  album_artist: string | null;
  album: string | null;
  year: number | null;
  track_no: number | null;
  disc_no: number | null;
  genre: string | null;
  duration: number | null;
  bitrate: number | null;
  format: string | null;
  has_cover: boolean;
  file_path: string;
}

export interface ImportSuggestion {
  root_path: string;
  pattern: "album" | "artist_album" | "artist_album_disc" | "flat";
  depth: number;
  track_count: number;
  message: string;
}

export type ImportStrategy = "follow" | "ignore_parent" | "tracks_only";
export type RepeatMode = "off" | "one" | "all";
export type DestKind = "library" | "playlist" | "album" | "queue";
export type Screen = "library" | "playlists" | "search" | "downloads" | "settings";

export interface PlaylistCard {
  id: number;
  name: string;
  cover_path: string | null;
  description: string | null;
  sort_mode: string;
  track_count: number;
}

export interface TrackEdit {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  year?: number | null;
  genre?: string | null;
  track_no?: number | null;
  disc_no?: number | null;
}

export type PlaylistSort = "custom" | "recent" | "alpha" | "artist" | "year";

export type ThemeMode = "dark" | "light" | "system";
/** Container yt-dlp produces. m4a keeps the original stream; mp3 is the safest
 *  bet for car stereos and older players. */
export type AudioFormat = "m4a" | "mp3" | "opus" | "flac";

export interface Settings {
  theme: ThemeMode;
  crossfade: number;   // seconds (0 = off)
  replaygain: boolean;
  downloadDir: string;
  audioFormat: AudioFormat;
}

/** Health of the bundled yt-dlp/ffmpeg, shown in Configurações. */
export interface ToolStatus {
  ytdlp_version: string | null;
  ffmpeg_path: string | null;
  download_dir: string;
  download_dir_writable: boolean;
  audio_format: string;
}

export type ExportOrganize = "flat" | "artist" | "artist_album";
export type ExportNaming = "title" | "artist_title" | "track_title";

export interface ExportOptions {
  dest_dir: string;
  organize: ExportOrganize;
  naming: ExportNaming;
  convert_mp3: boolean;
  overwrite: boolean;
  playlist_file: boolean;
  playlist_name: string | null;
}

export interface ExportResult {
  copied: number;
  skipped: number;
  failed: number;
  dest_dir: string;
  errors: string[];
}

export interface ExportProgress {
  index: number;
  total: number;
  name: string;
  status: "copying" | "converting" | "ok" | "skipped" | "error";
}

export interface SearchResult {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string;
}

export interface CoverCandidate {
  thumb: string;
  full: string;
  label: string;
}

export type JobStatus = "running" | "done" | "error" | "pending" | "canceled";

export interface DownloadJob {
  id: number;
  url: string | null;
  type: string;
  status: JobStatus;
  progress: number;
  dest_kind: string | null;
  dest_id: number | null;
  title: string | null;
  file_path: string | null;
  error: string | null;
  track_id: number | null;
  created_at: string | null;
}

export interface DownloadProgress {
  job_id: number;
  status: JobStatus;
  progress: number;
  message: string;
  title: string;
  speed: string;
  eta: string;
  trackId: number | null;
  filePath: string | null;
}
