//! Provedor online de letras (ADR-06).
//!
//! Um `trait` com uma implementação (LRCLIB) e o registro pronto para outras.
//! Tudo aqui é **síncrono** — `ureq` é blocking —, então nenhuma destas funções
//! pode ser chamada direto de um `#[tauri::command]` async: quem chama envolve
//! em `spawn_blocking`, senão a busca em lote congela a UI.

use crate::error::{AppError, AppResult};
use std::sync::OnceLock;
use std::time::Duration;

/// Identificação do cliente, exigida pelos termos de uso do LRCLIB.
fn user_agent() -> String {
    format!(
        "Sonara/{} (+https://github.com/PedroA07/Sonara)",
        env!("CARGO_PKG_VERSION")
    )
}

/// Um único `Agent` reaproveitado por todo o processo.
///
/// Recriá-lo por requisição jogaria fora o pool de conexões — numa busca em
/// lote de 200 faixas isso é um handshake TLS por faixa.
fn agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(5))
            .timeout_read(Duration::from_secs(8))
            .build()
    })
}

/// O que se sabe da faixa na hora de perguntar ao provedor.
#[derive(Debug, Clone)]
pub struct TrackQuery {
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Duração local em **segundos** — `track.duration` é REAL em segundos.
    pub duration_secs: Option<f64>,
}

/// Um resultado devolvido pelo provedor, ainda não aplicado.
#[derive(Debug, Clone, PartialEq)]
pub struct LyricsCandidate {
    pub provider_id: String,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: Option<String>,
    pub duration_sec: f64,
    pub has_synced: bool,
    pub instrumental: bool,
    /// LRC sincronizado, quando houver.
    pub synced: Option<String>,
    /// Texto puro, como alternativa.
    pub plain: Option<String>,
}

impl LyricsCandidate {
    /// O melhor conteúdo disponível: sincronizado ganha de texto puro.
    pub fn best_content(&self) -> Option<&str> {
        self.synced
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| self.plain.as_deref().filter(|s| !s.trim().is_empty()))
    }
}

/// ADR-06: o registro é plugável; hoje só o LRCLIB está ligado.
pub trait LyricsProvider: Send + Sync {
    fn name(&self) -> &'static str;
    /// Busca exata — só devolve algo em que dá para confiar sozinho.
    fn lookup(&self, q: &TrackQuery) -> AppResult<Option<LyricsCandidate>>;
    /// Busca ampla — devolve candidatos para a pessoa escolher.
    fn search(&self, query: &str) -> AppResult<Vec<LyricsCandidate>>;
}

/// Tolerância de duração para aceitar um resultado sem confirmação humana.
pub const DURATION_TOLERANCE_SEC: i64 = 2;

/// As durações batem?
///
/// Os dois lados são arredondados para segundo inteiro **antes** de comparar.
/// A duração local é `f64` e a do provedor é inteira; comparar float com
/// inteiro geraria falso negativo em faixas de duração fracionária — uma faixa
/// de 183,6 s contra 184 do provedor está a 0,4 s de distância, não a 1.
pub fn duration_matches(local_secs: Option<f64>, remote_secs: f64) -> bool {
    match local_secs {
        None => false, // sem duração local não há como confirmar
        Some(local) => {
            let a = local.round() as i64;
            let b = remote_secs.round() as i64;
            (a - b).abs() <= DURATION_TOLERANCE_SEC
        }
    }
}

// ─────────────────────────── LRCLIB ───────────────────────────

pub struct LrcLib;

const LRCLIB_BASE: &str = "https://lrclib.net/api";

impl LrcLib {
    fn parse_candidate(v: &serde_json::Value) -> Option<LyricsCandidate> {
        let id = v.get("id")?;
        let synced = v.get("syncedLyrics").and_then(|x| x.as_str()).map(String::from);
        let plain = v.get("plainLyrics").and_then(|x| x.as_str()).map(String::from);
        let instrumental = v.get("instrumental").and_then(|x| x.as_bool()).unwrap_or(false);

        Some(LyricsCandidate {
            provider_id: id.to_string().trim_matches('"').to_string(),
            track_name: v.get("trackName").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            artist_name: v.get("artistName").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            album_name: v.get("albumName").and_then(|x| x.as_str()).map(String::from),
            duration_sec: v.get("duration").and_then(|x| x.as_f64()).unwrap_or(0.0),
            has_synced: synced.as_deref().is_some_and(|s| !s.trim().is_empty()),
            instrumental,
            synced,
            plain,
        })
    }
}

impl LyricsProvider for LrcLib {
    fn name(&self) -> &'static str {
        "lrclib"
    }

    fn lookup(&self, q: &TrackQuery) -> AppResult<Option<LyricsCandidate>> {
        let mut req = agent()
            .get(&format!("{LRCLIB_BASE}/get"))
            .set("User-Agent", &user_agent())
            .query("track_name", &q.title)
            .query("artist_name", &q.artist);

        if !q.album.trim().is_empty() {
            req = req.query("album_name", &q.album);
        }
        if let Some(d) = q.duration_secs {
            req = req.query("duration", &(d.round() as i64).to_string());
        }

        let body = match req.call() {
            Ok(resp) => resp.into_string().map_err(|e| AppError::Lyrics(e.to_string()))?,
            // 404 é a resposta normal para "não tenho essa letra".
            Err(ureq::Error::Status(404, _)) => return Ok(None),
            Err(e) => return Err(classify(e)),
        };

        let v: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| AppError::Lyrics(e.to_string()))?;
        Ok(Self::parse_candidate(&v))
    }

    fn search(&self, query: &str) -> AppResult<Vec<LyricsCandidate>> {
        let body = match agent()
            .get(&format!("{LRCLIB_BASE}/search"))
            .set("User-Agent", &user_agent())
            .query("q", query)
            .call()
        {
            Ok(resp) => resp.into_string().map_err(|e| AppError::Lyrics(e.to_string()))?,
            Err(ureq::Error::Status(404, _)) => return Ok(vec![]),
            Err(e) => return Err(classify(e)),
        };

        let v: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| AppError::Lyrics(e.to_string()))?;
        Ok(v.as_array()
            .map(|arr| arr.iter().filter_map(LrcLib::parse_candidate).take(20).collect())
            .unwrap_or_default())
    }
}

/// Erro do provedor traduzido para algo acionável.
///
/// O 429 chega aqui, e não no caminho feliz: `ureq` trata status >= 400 como
/// erro. É por isso que o `Retry-After` é lido neste ramo.
fn classify(e: ureq::Error) -> AppError {
    match e {
        ureq::Error::Status(429, resp) => {
            let wait = resp
                .header("Retry-After")
                .and_then(|v| v.trim().parse::<u64>().ok())
                .unwrap_or(60);
            AppError::Lyrics(format!(
                "O serviço de letras pediu uma pausa. Tente de novo em {wait}s."
            ))
        }
        ureq::Error::Status(code, _) if (500..600).contains(&code) => {
            AppError::Lyrics("O serviço de letras está fora do ar. Tente mais tarde.".into())
        }
        ureq::Error::Status(code, _) => {
            AppError::Lyrics(format!("O serviço de letras respondeu {code}."))
        }
        ureq::Error::Transport(t) => {
            let msg = t.to_string().to_ascii_lowercase();
            if msg.contains("timed out") || msg.contains("timeout") {
                AppError::Lyrics("A busca de letra demorou demais. Verifique a internet.".into())
            } else {
                AppError::Lyrics("Sem conexão para buscar a letra.".into())
            }
        }
    }
}

/// Quanto tempo um "não achei" continua valendo antes de perguntar de novo.
pub const MISS_TTL_SECS: i64 = 7 * 24 * 60 * 60;

/// Já vale tentar de novo esta faixa?
pub fn miss_expired(last_try_secs: i64, now_secs: i64) -> bool {
    now_secs - last_try_secs >= MISS_TTL_SECS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duration_matches_within_two_seconds() {
        assert!(duration_matches(Some(180.0), 180.0));
        assert!(duration_matches(Some(180.0), 182.0));
        assert!(duration_matches(Some(182.0), 180.0));
        assert!(!duration_matches(Some(180.0), 185.0));
        assert!(!duration_matches(Some(185.0), 180.0));
    }

    #[test]
    fn fractional_local_duration_does_not_cause_a_false_negative() {
        // Regressão: comparar 183.6 (float local) com 184 (inteiro do provedor)
        // sem arredondar os dois lados dava 0.4 de diferença tratada como 1.
        assert!(duration_matches(Some(183.6), 184.0));
        assert!(duration_matches(Some(183.4), 183.0));
        // O limite de ±2s vale sobre os segundos já arredondados, dos dois
        // lados: 180.49 vira 180 e ainda alcança 182; 180.51 vira 181 e por
        // isso *não* alcança 184.
        assert!(duration_matches(Some(180.49), 182.0));
        assert!(!duration_matches(Some(180.51), 184.0));
    }

    #[test]
    fn without_local_duration_nothing_is_auto_accepted() {
        // Sem duração local não há como confirmar que é a mesma gravação;
        // o resultado vira candidato, não aplicação automática.
        assert!(!duration_matches(None, 180.0));
    }

    #[test]
    fn negative_cache_expires_after_seven_days() {
        let now = 1_000_000_000;
        assert!(!miss_expired(now - 60, now), "um minuto atrás: não repergunta");
        assert!(!miss_expired(now - 6 * 24 * 3600, now), "seis dias: ainda vale");
        assert!(miss_expired(now - 7 * 24 * 3600, now), "sete dias: pode tentar");
        assert!(miss_expired(now - 30 * 24 * 3600, now));
    }

    #[test]
    fn best_content_prefers_synced() {
        let mut c = LyricsCandidate {
            provider_id: "1".into(),
            track_name: "t".into(),
            artist_name: "a".into(),
            album_name: None,
            duration_sec: 180.0,
            has_synced: true,
            instrumental: false,
            synced: Some("[00:01.00]com tempo".into()),
            plain: Some("sem tempo".into()),
        };
        assert_eq!(c.best_content(), Some("[00:01.00]com tempo"));
        c.synced = None;
        assert_eq!(c.best_content(), Some("sem tempo"));
        // String vazia não conta como letra.
        c.plain = Some("   ".into());
        assert_eq!(c.best_content(), None);
    }

    #[test]
    fn parses_a_provider_payload() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{"id":123,"trackName":"Uma Faixa","artistName":"Alguem",
                "albumName":"Um Album","duration":183,
                "syncedLyrics":"[00:01.00]texto inventado","plainLyrics":"texto inventado",
                "instrumental":false}"#,
        )
        .expect("json de teste");
        let c = LrcLib::parse_candidate(&v).expect("candidato");
        assert_eq!(c.provider_id, "123");
        assert_eq!(c.track_name, "Uma Faixa");
        assert_eq!(c.duration_sec, 183.0);
        assert!(c.has_synced);
        assert!(!c.instrumental);
    }

    #[test]
    fn instrumental_payload_has_no_content() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{"id":9,"trackName":"So Instrumental","artistName":"Alguem",
                "duration":200,"instrumental":true,"syncedLyrics":null,"plainLyrics":null}"#,
        )
        .expect("json de teste");
        let c = LrcLib::parse_candidate(&v).expect("candidato");
        assert!(c.instrumental);
        assert!(!c.has_synced);
        assert_eq!(c.best_content(), None);
    }

    #[test]
    fn user_agent_identifies_the_client() {
        let ua = user_agent();
        assert!(ua.starts_with("Sonara/"), "{ua}");
        assert!(ua.contains("github.com/PedroA07/Sonara"), "{ua}");
    }
}
