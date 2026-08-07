// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod error;
mod models;
mod services;

use db::Db;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&dir)?;
            let db = Db::open(&dir.join("sonara.db"))?;
            db.migrate()?;
            app.manage(db);
            app.manage(commands::download::Downloads::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::list_tracks,
            commands::library::search_library,
            commands::library::list_albums,
            commands::library::album_tracks,
            commands::library::list_artists,
            commands::library::update_album,
            commands::library::delete_album,
            commands::library::rename_artist,
            commands::library::delete_artist,
            commands::import::scan_folder,
            commands::import::list_audio_files,
            commands::import::parse_files,
            commands::import::import_with_strategy,
            commands::playback::set_queue,
            commands::playback::get_queue,
            commands::download::start_download,
            commands::download::cancel_download,
            commands::download::preview_download_args,
            commands::download::list_download_jobs,
            commands::download::clear_download_history,
            commands::download::check_download_tools,
            commands::download::youtube_search,
            commands::export::export_tracks,
            commands::export::open_path,
            commands::edit::update_track_metadata,
            commands::edit::set_track_cover,
            commands::edit::read_image_base64,
            commands::edit::set_cover_from_bytes,
            commands::edit::search_cover_art,
            commands::edit::set_cover_from_url,
            commands::playlists::list_playlists,
            commands::playlists::create_playlist,
            commands::playlists::update_playlist,
            commands::playlists::delete_playlist,
            commands::playlists::add_to_playlist,
            commands::playlists::remove_from_playlist,
            commands::playlists::reorder_playlist,
            commands::playlists::playlist_tracks,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::settings::default_paths,
            commands::search::rebuild_search_index,
            commands::maintenance::find_duplicates,
            commands::maintenance::delete_tracks,
            commands::enrich::enrich_album,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sonara");
}
