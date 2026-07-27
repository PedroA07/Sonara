import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type {
  Track, AlbumCard, Artist, ParsedTrack, ImportSuggestion, ImportStrategy, DestKind,
  PlaylistCard, TrackEdit, DownloadJob, SearchResult,
} from "../types";

export const api = {
  // Library / navigation (RF-03)
  listTracks: () => invoke<Track[]>("list_tracks"),
  searchLibrary: (query: string) => invoke<Track[]>("search_library", { query }),
  listAlbums: () => invoke<AlbumCard[]>("list_albums"),
  albumTracks: (albumId: number) => invoke<Track[]>("album_tracks", { albumId }),
  listArtists: () => invoke<Artist[]>("list_artists"),
  // Import (RF-01 / RF-02)
  scanFolder: (path: string) => invoke<ImportSuggestion>("scan_folder", { path }),
  listAudioFiles: (path: string) => invoke<string[]>("list_audio_files", { path }),
  parseFiles: (paths: string[]) => invoke<ParsedTrack[]>("parse_files", { paths }),
  importWithStrategy: (tracks: ParsedTrack[], strategy: ImportStrategy) =>
    invoke<number>("import_with_strategy", { tracks, strategy }),
  // Queue (RF-06)
  setQueue: (trackIds: number[]) => invoke<void>("set_queue", { trackIds }),
  getQueue: () => invoke<Track[]>("get_queue"),
  // Download (RF-09 / RF-10)
  startDownload: (input: string, destKind?: DestKind, destId?: number) =>
    invoke<number>("start_download", { input, destKind, destId }),
  listDownloadJobs: () => invoke<DownloadJob[]>("list_download_jobs"),
  youtubeSearch: (query: string, limit?: number) => invoke<SearchResult[]>("youtube_search", { query, limit }),
  // Maintenance / enrichment (F5)
  rebuildSearchIndex: () => invoke<void>("rebuild_search_index"),
  findDuplicates: () => invoke<Track[]>("find_duplicates"),
  deleteTracks: (ids: number[]) => invoke<number>("delete_tracks", { ids }),
  enrichAlbum: (albumId: number) => invoke<string | null>("enrich_album", { albumId }),
  // Metadata editing (RF-05)
  updateTrackMetadata: (trackIds: number[], edit: TrackEdit, writeFile: boolean) =>
    invoke<number>("update_track_metadata", { trackIds, edit, writeFile }),
  setTrackCover: (trackId: number, imagePath: string, writeFile: boolean) =>
    invoke<void>("set_track_cover", { trackId, imagePath, writeFile }),
  readImageBase64: (path: string) => invoke<string>("read_image_base64", { path }),
  setCoverFromBytes: (trackId: number, pngBase64: string, writeFile: boolean) =>
    invoke<string>("set_cover_from_bytes", { trackId, pngBase64, writeFile }),
  // Playlists (RF-04)
  listPlaylists: () => invoke<PlaylistCard[]>("list_playlists"),
  createPlaylist: (name: string) => invoke<number>("create_playlist", { name }),
  updatePlaylist: (id: number, fields: { name?: string; description?: string; coverPath?: string; sortMode?: string }) =>
    invoke<void>("update_playlist", { id, ...fields }),
  deletePlaylist: (id: number) => invoke<void>("delete_playlist", { id }),
  addToPlaylist: (playlistId: number, trackIds: number[]) =>
    invoke<void>("add_to_playlist", { playlistId, trackIds }),
  removeFromPlaylist: (playlistId: number, trackId: number) =>
    invoke<void>("remove_from_playlist", { playlistId, trackId }),
  reorderPlaylist: (playlistId: number, orderedTrackIds: number[]) =>
    invoke<void>("reorder_playlist", { playlistId, orderedTrackIds }),
  playlistTracks: (playlistId: number) => invoke<Track[]>("playlist_tracks", { playlistId }),
  // Settings (F3)
  getSettings: () => invoke<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
};

/** Resolve a local file path into a URL the webview can play/display. */
export function fileUrl(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    return path; // browser preview fallback
  }
}
