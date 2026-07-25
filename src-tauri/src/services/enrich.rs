//! F5: metadata/cover enrichment via MusicBrainz + Cover Art Archive.
//! Network calls use ureq (blocking). MusicBrainz requires a descriptive
//! User-Agent and asks for <= 1 request/second.

use crate::error::{AppError, AppResult};
use std::io::Read;
use std::path::Path;

const UA: &str = "Sonara/0.1 ( https://github.com/PedroA07/Sonara )";

/// Build the Lucene query string used against the MusicBrainz release endpoint.
/// Pure function → unit-tested.
pub fn mb_query(album: &str, artist: Option<&str>) -> String {
    let mut q = format!("release:\"{album}\"");
    if let Some(a) = artist {
        if !a.is_empty() {
            q.push_str(&format!(" AND artist:\"{a}\""));
        }
    }
    q
}

/// Look up the best-matching release MBID for an album/artist.
pub fn find_release_mbid(album: &str, artist: Option<&str>) -> AppResult<Option<String>> {
    let body = ureq::get("https://musicbrainz.org/ws/2/release/")
        .query("query", &mb_query(album, artist))
        .query("fmt", "json")
        .query("limit", "1")
        .set("User-Agent", UA)
        .call()
        .map_err(|e| AppError::Other(format!("musicbrainz: {e}")))?
        .into_string()
        .map_err(AppError::Io)?;

    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| AppError::Other(format!("mb json: {e}")))?;
    Ok(v["releases"]
        .get(0)
        .and_then(|r| r["id"].as_str())
        .map(|s| s.to_string()))
}

/// Download the front cover for a release MBID to `dest`.
pub fn download_cover(mbid: &str, dest: &Path) -> AppResult<()> {
    let url = format!("https://coverartarchive.org/release/{mbid}/front");
    let resp = ureq::get(&url)
        .set("User-Agent", UA)
        .call()
        .map_err(|e| AppError::Download(format!("cover art: {e}")))?;
    let mut buf = Vec::new();
    resp.into_reader()
        .read_to_end(&mut buf)
        .map_err(AppError::Io)?;
    std::fs::write(dest, &buf)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_mb_query() {
        assert_eq!(mb_query("Discovery", Some("Daft Punk")), "release:\"Discovery\" AND artist:\"Daft Punk\"");
        assert_eq!(mb_query("Discovery", None), "release:\"Discovery\"");
        assert_eq!(mb_query("Discovery", Some("")), "release:\"Discovery\"");
    }
}
