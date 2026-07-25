//! MetadataService (read side). Uses `lofty` to parse tags and cover presence.
//! Write side (node-id3 / lofty write) lands in F2 with the track editor.

use crate::error::{AppError, AppResult};
use crate::models::ParsedTrack;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::Accessor;
use std::path::Path;

const AUDIO_EXTS: &[&str] = &["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "wma", "aiff"];

pub fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Extract metadata from a single audio file (RF-01).
pub fn parse_file(path: &Path) -> AppResult<ParsedTrack> {
    let tagged = lofty::read_from_path(path)
        .map_err(|e| AppError::Metadata(format!("{path:?}: {e}")))?;
    let props = tagged.properties();

    let mut out = ParsedTrack {
        file_path: path.to_string_lossy().to_string(),
        duration: Some(props.duration().as_secs_f64()),
        bitrate: props.audio_bitrate().map(|b| b as i64),
        format: path.extension().and_then(|e| e.to_str()).map(|s| s.to_string()),
        ..Default::default()
    };

    if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
        out.title = tag.title().map(|s| s.to_string());
        out.artist = tag.artist().map(|s| s.to_string());
        out.album = tag.album().map(|s| s.to_string());
        out.genre = tag.genre().map(|s| s.to_string());
        out.year = tag.year().map(|y| y as i64);
        out.track_no = tag.track().map(|n| n as i64);
        out.disc_no = tag.disk().map(|n| n as i64);
        out.has_cover = !tag.pictures().is_empty();
        out.gain = read_replaygain(tag);
    }
    Ok(out)
}

/// Parse REPLAYGAIN_TRACK_GAIN (e.g. "-6.48 dB") into a linear multiplier.
fn read_replaygain(tag: &lofty::tag::Tag) -> Option<f64> {
    use lofty::tag::ItemKey;
    let raw = tag.get_string(&ItemKey::ReplayGainTrackGain)?;
    let num: f64 = raw.split_whitespace().next()?.parse().ok()?;
    Some(crate::services::downloader::db_to_linear(num))
}

/// Extract the front cover into `cache_dir` and return the written path (RF-05 display).
pub fn extract_cover_to(path: &Path, cache_dir: &Path, key: &str) -> Option<String> {
    let tagged = lofty::read_from_path(path).ok()?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
    let pic = tag.pictures().first()?;
    let ext = match pic.mime_type() {
        Some(lofty::picture::MimeType::Png) => "png",
        _ => "jpg",
    };
    std::fs::create_dir_all(cache_dir).ok()?;
    let out = cache_dir.join(format!("{key}.{ext}"));
    std::fs::write(&out, pic.data()).ok()?;
    Some(out.to_string_lossy().to_string())
}

use crate::models::TrackEdit;
use lofty::config::WriteOptions;
use lofty::tag::{Tag, TagExt};

/// RF-05 (write side): persist edited tags back into the audio file.
pub fn write_tags(path: &Path, edit: &TrackEdit) -> AppResult<()> {
    let mut tagged =
        lofty::read_from_path(path).map_err(|e| AppError::Metadata(format!("{path:?}: {e}")))?;

    if tagged.primary_tag_mut().is_none() {
        let tt = tagged.primary_tag_type();
        tagged.insert_tag(Tag::new(tt));
    }
    let tag = tagged.primary_tag_mut().unwrap();

    if let Some(v) = &edit.title { tag.set_title(v.clone()); }
    if let Some(v) = &edit.artist { tag.set_artist(v.clone()); }
    if let Some(v) = &edit.album { tag.set_album(v.clone()); }
    if let Some(v) = &edit.genre { tag.set_genre(v.clone()); }
    if let Some(v) = edit.year { tag.set_year(v as u32); }
    if let Some(v) = edit.track_no { tag.set_track(v as u32); }
    if let Some(v) = edit.disc_no { tag.set_disk(v as u32); }

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| AppError::Metadata(format!("save {path:?}: {e}")))?;
    Ok(())
}

/// RF-05: embed a cover image (front) into the audio file.
pub fn embed_cover(path: &Path, image_path: &Path) -> AppResult<()> {
    use lofty::picture::{MimeType, Picture, PictureType};

    let data = std::fs::read(image_path)?;
    let mime = match image_path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()) {
        Some(ref e) if e == "png" => MimeType::Png,
        _ => MimeType::Jpeg,
    };
    let picture = Picture::new_unchecked(PictureType::CoverFront, Some(mime), None, data);

    let mut tagged =
        lofty::read_from_path(path).map_err(|e| AppError::Metadata(format!("{path:?}: {e}")))?;
    if tagged.primary_tag_mut().is_none() {
        let tt = tagged.primary_tag_type();
        tagged.insert_tag(Tag::new(tt));
    }
    let tag = tagged.primary_tag_mut().unwrap();
    tag.remove_picture_type(PictureType::CoverFront);
    tag.push_picture(picture);

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| AppError::Metadata(format!("save cover {path:?}: {e}")))?;
    Ok(())
}
