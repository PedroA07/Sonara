// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod error;
mod models;
mod services;

use db::Db;
use tauri::{LogicalSize, Manager};

/// Keep the window inside the screen. A fixed default size (in logical pixels)
/// is taller than the usable area on small or display-scaled screens, so the
/// window opened partly off-screen and dialogs looked cut off at the top.
/// Everything here is best-effort: a failure must never stop the app starting.
fn fit_window_to_screen(app: &tauri::App) {
    let Some(win) = app.get_webview_window("main") else { return };
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };

    let scale = monitor.scale_factor();
    let screen = monitor.size().to_logical::<f64>(scale);
    // Room for the taskbar and the window frame.
    let max_w = (screen.width - 32.0).max(640.0);
    let max_h = (screen.height - 96.0).max(460.0);

    if let Ok(outer) = win.outer_size() {
        let cur = outer.to_logical::<f64>(scale);
        if cur.width > max_w || cur.height > max_h {
            let _ = win.set_size(LogicalSize::new(cur.width.min(max_w), cur.height.min(max_h)));
        }
    }
    let _ = win.center();
}

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
            fit_window_to_screen(app);
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
            commands::lyrics::lyrics_get,
            commands::lyrics::lyrics_resolve,
            commands::lyrics::lyrics_set_manual,
            commands::lyrics::lyrics_set_offset,
            commands::lyrics::lyrics_delete,
            commands::lyrics::lyrics_write_sidecar,
            commands::lyrics::lyrics_embed_tags,
            commands::lyrics::lyrics_status,
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
