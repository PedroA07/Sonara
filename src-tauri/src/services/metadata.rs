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

/// Título de reserva quando não há tag nenhuma: o nome do arquivo, sem extensão.
fn title_from_path(path: &Path) -> Option<String> {
    path.file_stem()
        .map(|s| s.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty())
}

/// O esqueleto de uma faixa a partir do caminho, sem abrir o arquivo.
fn from_path_only(path: &Path) -> ParsedTrack {
    ParsedTrack {
        file_path: path.to_string_lossy().to_string(),
        title: title_from_path(path),
        format: path.extension().and_then(|e| e.to_str()).map(|s| s.to_string()),
        tags_unreadable: true,
        ..Default::default()
    }
}

/// Extract metadata from a single audio file (RF-01).
///
/// **Um arquivo que existe nunca é recusado aqui.** A leitura de tags é uma
/// tentativa em três etapas, cada uma menos exigente que a anterior:
///
/// 1. leitura normal (tags + propriedades do áudio);
/// 2. só as tags, sem analisar os quadros do áudio;
/// 3. nada — o nome do arquivo vira o título.
///
/// O motivo é concreto: um MP3 com ID3 malformado (cabeçalho declarando um
/// tamanho maior que o arquivo, tag cortada por uma cópia interrompida, ripador
/// antigo) faz o `lofty` recusar o arquivo **inteiro**, mesmo com o áudio
/// perfeitamente tocável. Antes, esses arquivos sumiam sem uma palavra: a
/// importação anunciava "12 músicas importadas" e três nunca apareciam na
/// biblioteca. Um título vindo do nome do arquivo é infinitamente melhor do que
/// uma música que desaparece.
pub fn parse_file(path: &Path) -> AppResult<ParsedTrack> {
    if !path.is_file() {
        return Err(AppError::Metadata(format!(
            "{}: o arquivo não existe mais",
            path.display()
        )));
    }

    // 1 — leitura completa.
    if let Ok(tagged) = lofty::read_from_path(path) {
        return Ok(from_tagged(path, &tagged, false));
    }

    // 2 — as propriedades do áudio é que costumam falhar (quadro inválido),
    //     não as tags. Sem elas, o mesmo arquivo normalmente é lido inteiro.
    if let Ok(tagged) = read_lenient(path) {
        return Ok(from_tagged(path, &tagged, true));
    }

    // 3 — nem as tags saíram; o nome do arquivo é o que resta.
    Ok(from_path_only(path))
}

/// Segunda tentativa: sem propriedades e no modo mais tolerante do lofty.
fn read_lenient(path: &Path) -> Result<lofty::file::TaggedFile, lofty::error::LoftyError> {
    use lofty::config::{ParseOptions, ParsingMode};
    lofty::probe::Probe::open(path)?
        .options(
            ParseOptions::new()
                .read_properties(false)
                .parsing_mode(ParsingMode::Relaxed),
        )
        .guess_file_type()?
        .read()
}

/// Converte o arquivo já aberto em `ParsedTrack`.
///
/// `degraded` marca que a leitura precisou abrir mão das propriedades do áudio:
/// duração e bitrate ficam vazios, e a UI diz quantos arquivos vieram assim.
fn from_tagged(path: &Path, tagged: &lofty::file::TaggedFile, degraded: bool) -> ParsedTrack {
    let props = tagged.properties();
    let duration = props.duration().as_secs_f64();

    let mut out = ParsedTrack {
        file_path: path.to_string_lossy().to_string(),
        // Duração zero não é uma duração: é o valor que sobra quando o arquivo
        // não foi analisado. Guardá-la faria a lista mostrar "0:00".
        duration: (duration > 0.0).then_some(duration),
        bitrate: props.audio_bitrate().map(|b| b as i64).filter(|b| *b > 0),
        format: path.extension().and_then(|e| e.to_str()).map(|s| s.to_string()),
        tags_unreadable: degraded,
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

    // Sem título nas tags, o nome do arquivo serve — e serve melhor que
    // "Sem título" repetido dezenas de vezes na biblioteca.
    if out.title.as_deref().map(str::trim).unwrap_or("").is_empty() {
        out.title = title_from_path(path);
    }
    out
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/audio").join(name)
    }

    #[test]
    fn recognises_audio_by_extension() {
        assert!(is_audio_file(Path::new("a/b/musica.mp3")));
        assert!(is_audio_file(Path::new("MUSICA.MP3")), "extensão maiúscula também é mp3");
        assert!(is_audio_file(Path::new("x.flac")) && is_audio_file(Path::new("x.m4a")));
        assert!(!is_audio_file(Path::new("capa.jpg")));
        assert!(!is_audio_file(Path::new("sem-extensao")));
    }

    #[test]
    fn reads_a_normal_mp3() {
        let t = parse_file(&fixture("normal.mp3")).unwrap();
        assert_eq!(t.title.as_deref(), Some("Cafe Sem Acucar"));
        assert_eq!(t.artist.as_deref(), Some("Aurora Fria"));
        assert!(t.duration.unwrap() > 0.0);
        assert_eq!(t.format.as_deref(), Some("mp3"));
        assert!(!t.tags_unreadable);
    }

    /// Regressão: este arquivo fazia o `lofty` recusar tudo, e a faixa sumia da
    /// biblioteca sem nenhuma mensagem — a importação dizia "N importadas" e o
    /// N não batia com o que a pessoa via.
    #[test]
    fn an_mp3_with_a_broken_id3_header_is_still_imported() {
        let t = parse_file(&fixture("id3-tamanho-invalido.mp3")).unwrap();
        assert!(t.tags_unreadable, "precisa ficar marcado para a UI poder avisar");
        assert!(
            t.title.as_deref().is_some_and(|s| !s.is_empty()),
            "sem tag legível, o nome do arquivo vira o título"
        );
        assert_eq!(t.format.as_deref(), Some("mp3"));
        assert_eq!(t.file_path, fixture("id3-tamanho-invalido.mp3").to_string_lossy());
    }

    #[test]
    fn an_mp3_without_tags_gets_its_name_as_the_title() {
        let t = parse_file(&fixture("sem-tags.mp3")).unwrap();
        assert_eq!(t.title.as_deref(), Some("sem-tags"));
        // Lido por inteiro: só não havia tag nenhuma.
        assert!(!t.tags_unreadable);
        assert!(t.duration.unwrap() > 0.0);
    }

    /// Um arquivo que não é áudio não pode virar faixa fantasma na biblioteca.
    #[test]
    fn a_non_audio_file_is_not_silently_accepted() {
        let p = fixture("nao-e-audio.txt");
        assert!(!is_audio_file(&p), "o filtro por extensão é a primeira barreira");
    }

    #[test]
    fn a_missing_file_is_an_error_not_a_ghost_track() {
        assert!(parse_file(&fixture("nao-existe.mp3")).is_err());
    }
}
