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

export type ThemeMode = "dark" | "light";
export interface Settings {
  theme: ThemeMode;
  crossfade: number;   // seconds (0 = off)
  replaygain: boolean;
}

export interface DownloadJob {
  id: number;
  url: string | null;
  type: string;
  status: "running" | "done" | "error" | "pending";
  progress: number;
  dest_kind: string | null;
  dest_id: number | null;
}

export interface DownloadProgress {
  job_id: number;
  status: "running" | "done" | "error";
  progress: number;
  message: string;
}
