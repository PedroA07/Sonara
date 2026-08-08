//! LyricsService — parsing de LRC e detecção de refrão.
//!
//! Tudo aqui é função pura: entra texto, sai estrutura. Isso é deliberado
//! (ADR-03) — o mesmo parser atende às três origens de letra (tags embutidas,
//! arquivo `.lrc` ao lado do áudio e provedor online), e fica testável sem
//! banco, sem rede e sem arquivo.

use crate::models::{LyricLine, LyricWord, LyricsKind};

/// Vão a partir do qual a UI mostra o indicador de trecho instrumental.
const GAP_THRESHOLD_MS: i64 = 6_000;
/// Linhas mais curtas que isto não entram na detecção de refrão ("oh", "ei").
const MIN_CHORUS_CHARS: usize = 3;
/// Um refrão precisa de pelo menos duas linhas seguidas.
const MIN_CHORUS_LINES: usize = 2;
/// Teto de grupos distintos de refrão, para não pintar a letra inteira quando
/// a música é muito repetitiva.
const MAX_CHORUS_GROUPS: usize = 3;

/// Resultado do parse, antes de virar o `Lyrics` que vai para o front.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedLyrics {
    pub kind: LyricsKind,
    pub lines: Vec<LyricLine>,
    /// `[offset:]` declarado no próprio arquivo, em ms (pode ser negativo).
    /// Já vem aplicado em `lines`; devolvido só para diagnóstico.
    pub file_offset_ms: i64,
    pub plain_text: Option<String>,
}

// ─────────────────────────── decodificação ───────────────────────────

/// Lê bytes de origem desconhecida como texto.
///
/// LRC circula muito em Latin-1, sobretudo em arquivos antigos. Tentar UTF-8 e
/// cair para Latin-1 evita transformar "coração" em bytes perdidos — e
/// Latin-1 nunca falha, porque todo byte é um code point válido.
pub fn decode_text(bytes: &[u8]) -> String {
    let text = match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => bytes.iter().map(|&b| b as char).collect(),
    };
    // BOM e CRLF: normalizados aqui para o parser não precisar saber deles.
    text.trim_start_matches('\u{feff}').replace("\r\n", "\n").replace('\r', "\n")
}

// ─────────────────────────── timestamps ───────────────────────────

/// `mm:ss`, `mm:ss.x`, `mm:ss.xx`, `mm:ss.xxx` → milissegundos.
///
/// A parte fracionária é interpretada pelo número de dígitos: `.5` é meio
/// segundo, `.05` são 50 ms. Ler tudo como centésimos quebraria os arquivos
/// que usam milissegundos.
pub fn parse_timestamp(s: &str) -> Option<i64> {
    let s = s.trim();
    let (mm, rest) = s.split_once(':')?;
    let minutes: i64 = mm.trim().parse().ok()?;
    if minutes < 0 {
        return None;
    }

    let (ss, frac) = match rest.split_once(['.', ':']) {
        Some((a, b)) => (a, Some(b)),
        None => (rest, None),
    };
    let seconds: i64 = ss.trim().parse().ok()?;
    if !(0..60).contains(&seconds) {
        return None;
    }

    let millis = match frac {
        None => 0,
        Some(f) => {
            let digits: String = f.chars().take_while(|c| c.is_ascii_digit()).collect();
            if digits.is_empty() {
                return None;
            }
            let value: i64 = digits.parse().ok()?;
            match digits.len() {
                1 => value * 100,
                2 => value * 10,
                _ => value / 10i64.pow(digits.len() as u32 - 3),
            }
        }
    };
    Some(minutes * 60_000 + seconds * 1_000 + millis)
}

/// Separa os `[...]` do início da linha do texto que sobra.
fn split_brackets(line: &str) -> (Vec<String>, &str) {
    let mut tags = Vec::new();
    let mut rest = line;
    loop {
        let trimmed = rest.trim_start();
        if !trimmed.starts_with('[') {
            return (tags, trimmed);
        }
        match trimmed.find(']') {
            Some(end) => {
                tags.push(trimmed[1..end].to_string());
                rest = &trimmed[end + 1..];
            }
            None => return (tags, trimmed),
        }
    }
}

/// `<mm:ss.xx>palavra` — o LRC "enhanced", com tempo por palavra.
fn parse_words(text: &str, line_start_ms: i64) -> (String, Option<Vec<LyricWord>>) {
    if !text.contains('<') {
        return (text.trim().to_string(), None);
    }

    let mut words: Vec<LyricWord> = Vec::new();
    let mut plain = String::new();
    let mut rest = text;
    let mut pending: Option<i64> = None;

    while let Some(open) = rest.find('<') {
        let (before, after) = rest.split_at(open);
        if !before.is_empty() {
            plain.push_str(before);
            if let Some(start) = pending.take() {
                push_word(&mut words, start, before);
            }
        }
        match after.find('>') {
            Some(close) => {
                pending = parse_timestamp(&after[1..close]);
                rest = &after[close + 1..];
            }
            // "<" solto no meio da letra: trata como texto comum.
            None => {
                plain.push_str(after);
                rest = "";
                break;
            }
        }
    }
    if !rest.is_empty() {
        plain.push_str(rest);
        if let Some(start) = pending.take() {
            push_word(&mut words, start, rest);
        }
    }

    // Cada palavra termina onde a próxima começa; a última herda o fim da linha.
    for i in 0..words.len() {
        let end = words.get(i + 1).map(|w| w.start_ms).unwrap_or(words[i].start_ms);
        words[i].end_ms = end.max(words[i].start_ms);
    }
    let _ = line_start_ms;

    let plain = plain.trim().to_string();
    if words.is_empty() { (plain, None) } else { (plain, Some(words)) }
}

fn push_word(words: &mut Vec<LyricWord>, start_ms: i64, raw: &str) {
    let text = raw.trim();
    if !text.is_empty() {
        words.push(LyricWord { start_ms, end_ms: start_ms, text: text.to_string() });
    }
}

// ─────────────────────────── parser principal ───────────────────────────

/// Converte um LRC (ou texto puro) na estrutura que o front desenha.
///
/// `user_offset_ms` é a calibração da faixa; soma-se ao `[offset:]` do arquivo.
pub fn parse(raw: &str, user_offset_ms: i64) -> ParsedLyrics {
    let text = decode_text(raw.as_bytes());
    let mut file_offset_ms = 0i64;
    // (ordem de leitura, início em ms, texto) — a ordem preserva o desempate
    // entre timestamps idênticos.
    let mut timed: Vec<(usize, i64, String)> = Vec::new();
    let mut seq = 0usize;

    for line in text.lines() {
        let (tags, body) = split_brackets(line);
        if tags.is_empty() {
            continue;
        }

        let mut starts: Vec<i64> = Vec::new();
        for tag in &tags {
            if let Some(ms) = parse_timestamp(tag) {
                starts.push(ms);
                continue;
            }
            // Metadado: só `offset` altera o resultado; os demais são
            // informativos e não têm onde aparecer na UI hoje.
            if let Some((key, value)) = tag.split_once(':') {
                if key.trim().eq_ignore_ascii_case("offset") {
                    if let Ok(v) = value.trim().parse::<i64>() {
                        file_offset_ms = v;
                    }
                }
            }
        }

        // Um mesmo texto pode ter vários timestamps: vira uma linha por tempo.
        for ms in starts {
            timed.push((seq, ms, body.to_string()));
            seq += 1;
        }
    }

    if timed.is_empty() {
        return parse_plain(&text);
    }

    // Fora de ordem é comum em arquivos editados à mão. A ordenação é estável
    // por (tempo, ordem de leitura), então timestamps duplicados mantêm a
    // sequência original em vez de embaralhar.
    timed.sort_by_key(|(seq, ms, _)| (*ms, *seq));

    let total_offset = file_offset_ms + user_offset_ms;
    let mut lines: Vec<LyricLine> = Vec::new();

    for (_, ms, body) in &timed {
        let start_ms = ms + total_offset;
        let (plain, words) = parse_words(body, start_ms);
        let words = words.map(|ws| {
            ws.into_iter()
                .map(|w| LyricWord {
                    start_ms: w.start_ms + total_offset,
                    end_ms: w.end_ms + total_offset,
                    text: w.text,
                })
                .collect()
        });
        let is_gap = plain.is_empty();
        lines.push(LyricLine {
            index: 0, // atribuído depois, já com as linhas sintéticas
            start_ms,
            end_ms: start_ms,
            text: plain,
            words,
            is_chorus: false,
            chorus_id: None,
            is_gap,
        });
    }

    let mut lines = insert_gap_lines(lines);
    close_line_ends(&mut lines);
    detect_chorus(&mut lines);
    for (i, l) in lines.iter_mut().enumerate() {
        l.index = i as i64;
    }

    ParsedLyrics { kind: LyricsKind::Synced, lines, file_offset_ms, plain_text: None }
}

/// Letra sem nenhum timestamp válido: uma linha por quebra, sem tempo.
fn parse_plain(text: &str) -> ParsedLyrics {
    let lines: Vec<LyricLine> = text
        .lines()
        // Linha inteiramente entre colchetes é metadado de LRC, não letra.
        .filter(|l| {
            let t = l.trim();
            !(t.starts_with('[') && t.ends_with(']'))
        })
        .map(|l| {
            let t = l.trim().to_string();
            let is_gap = t.is_empty();
            LyricLine {
                index: 0,
                start_ms: 0,
                end_ms: 0,
                text: t,
                words: None,
                is_chorus: false,
                chorus_id: None,
                is_gap,
            }
        })
        .collect();

    // Um arquivo só de linhas vazias não é letra.
    if lines.iter().all(|l| l.is_gap) {
        return ParsedLyrics {
            kind: LyricsKind::Plain,
            lines: Vec::new(),
            file_offset_ms: 0,
            plain_text: Some(String::new()),
        };
    }

    let mut lines = lines;
    detect_chorus(&mut lines);
    for (i, l) in lines.iter_mut().enumerate() {
        l.index = i as i64;
    }
    let plain = lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n");
    ParsedLyrics {
        kind: LyricsKind::Plain,
        lines,
        file_offset_ms: 0,
        plain_text: Some(plain),
    }
}

/// Insere uma linha sintética quando há um vão longo entre duas falas, para a
/// UI ter onde desenhar o indicador de instrumental.
fn insert_gap_lines(lines: Vec<LyricLine>) -> Vec<LyricLine> {
    let mut out: Vec<LyricLine> = Vec::with_capacity(lines.len());
    for line in lines {
        if let Some(prev) = out.last() {
            // O intervalo é medido de início a início: uma linha não declara
            // quanto tempo é cantada, então o que sobra é quanto tempo ela fica
            // sozinha na tela.
            let interval = line.start_ms - prev.start_ms;
            if !prev.is_gap && !line.is_gap && interval > GAP_THRESHOLD_MS {
                // O intervalo é dividido: a primeira metade ainda pertence à
                // linha anterior (que continua sendo cantada), a segunda é o
                // trecho instrumental de fato.
                out.push(LyricLine {
                    index: 0,
                    start_ms: prev.start_ms + interval / 2,
                    end_ms: line.start_ms,
                    text: String::new(),
                    words: None,
                    is_chorus: false,
                    chorus_id: None,
                    is_gap: true,
                });
            }
        }
        out.push(line);
    }
    out
}

/// `end_ms` de cada linha é o início da próxima. A última fica em aberto e é
/// fechada pelo chamador, que é quem conhece a duração da faixa.
fn close_line_ends(lines: &mut [LyricLine]) {
    for i in 0..lines.len() {
        if let Some(next_start) = lines.get(i + 1).map(|l| l.start_ms) {
            lines[i].end_ms = next_start.max(lines[i].start_ms);
        }
    }
}

/// Fecha a última linha com a duração da faixa (em ms). Sem isso a linha final
/// nunca "termina" e o destaque fica preso nela.
pub fn close_with_duration(lines: &mut [LyricLine], duration_ms: Option<i64>) {
    if let Some(last) = lines.last_mut() {
        if last.end_ms <= last.start_ms {
            last.end_ms = duration_ms.filter(|d| *d > last.start_ms).unwrap_or(last.start_ms + 5_000);
        }
    }
}

// ─────────────────────────── detecção de refrão ───────────────────────────

fn strip_accent(c: char) -> char {
    match c {
        'á' | 'à' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' => 'u',
        'ç' => 'c',
        'ñ' => 'n',
        'ý' | 'ÿ' => 'y',
        other => other,
    }
}

/// Assinatura comparável de uma linha: minúscula, sem acento, sem pontuação,
/// espaços colapsados. É o que faz "Refrão!" e "refrao" casarem.
pub fn normalize(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last_space = true;
    for c in text.chars().flat_map(|c| c.to_lowercase()).map(strip_accent) {
        if c.is_alphanumeric() {
            out.push(c);
            last_space = false;
        } else if !last_space {
            out.push(' ');
            last_space = true;
        }
    }
    out.trim().to_string()
}

/// Marca os blocos de linhas que se repetem ao longo da letra.
///
/// Determinístico de propósito: mesma letra, mesmo resultado, sempre — é o que
/// permite testar isto e o que evita o refrão "piscando" entre execuções.
pub fn detect_chorus(lines: &mut [LyricLine]) {
    // Índices das linhas que valem para comparação.
    let candidates: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, l)| !l.is_gap && normalize(&l.text).chars().count() >= MIN_CHORUS_CHARS)
        .map(|(i, _)| i)
        .collect();

    if candidates.len() < MIN_CHORUS_LINES * 2 {
        return; // letra curta demais para ter refrão — não force
    }

    let norm: Vec<String> = candidates.iter().map(|&i| normalize(&lines[i].text)).collect();
    let mut taken = vec![false; candidates.len()];
    let mut group = 0i64;

    while group < MAX_CHORUS_GROUPS as i64 {
        match best_block(&norm, &taken) {
            Some((len, starts)) => {
                group += 1;
                for &s in &starts {
                    for k in s..s + len {
                        taken[k] = true;
                        let li = candidates[k];
                        lines[li].is_chorus = true;
                        lines[li].chorus_id = Some(group);
                    }
                }
            }
            None => break,
        }
    }
}

/// Maior bloco de ≥2 linhas consecutivas que aparece ≥2 vezes, ignorando o que
/// já foi marcado. Empate no comprimento decide pela maior contagem; empate na
/// contagem decide pela primeira ocorrência (estabilidade).
fn best_block(norm: &[String], taken: &[bool]) -> Option<(usize, Vec<usize>)> {
    let n = norm.len();
    let max_len = n / 2;
    for len in (MIN_CHORUS_LINES..=max_len).rev() {
        let mut by_sig: std::collections::HashMap<String, Vec<usize>> = std::collections::HashMap::new();
        for start in 0..=n.saturating_sub(len) {
            if (start..start + len).any(|k| taken[k]) {
                continue;
            }
            let sig = norm[start..start + len].join("\n");
            if sig.trim().is_empty() {
                continue;
            }
            by_sig.entry(sig).or_default().push(start);
        }

        // Ocorrências sobrepostas do mesmo bloco contam uma vez só.
        let mut best: Option<Vec<usize>> = None;
        let mut keys: Vec<&String> = by_sig.keys().collect();
        keys.sort(); // determinismo: HashMap não tem ordem
        for key in keys {
            let starts = &by_sig[key];
            let mut chosen: Vec<usize> = Vec::new();
            for &s in starts {
                if chosen.last().is_none_or(|&last| s >= last + len) {
                    chosen.push(s);
                }
            }
            if chosen.len() < 2 {
                continue;
            }
            // Um "refrão" que cobre a letra inteira não distingue nada — é só
            // uma música curta e repetitiva.
            if chosen.len() * len >= n {
                continue;
            }
            let better = match &best {
                None => true,
                Some(cur) => chosen.len() > cur.len() || (chosen.len() == cur.len() && chosen[0] < cur[0]),
            };
            if better {
                best = Some(chosen);
            }
        }
        if let Some(starts) = best {
            return Some((len, starts));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // Todas as fixtures usam texto inventado — ver tests/fixtures/lyrics/LEIA-ME.md.
    fn lrc(body: &str) -> ParsedLyrics {
        parse(body, 0)
    }

    /// Só as linhas com texto. Os testes de ordenação não se importam com as
    /// linhas de intervalo que o parser insere entre falas distantes.
    fn spoken(p: &ParsedLyrics) -> Vec<&str> {
        p.lines.iter().filter(|l| !l.is_gap).map(|l| l.text.as_str()).collect()
    }

    #[test]
    fn parses_the_four_timestamp_shapes() {
        assert_eq!(parse_timestamp("01:02"), Some(62_000));
        assert_eq!(parse_timestamp("01:02.5"), Some(62_500));
        assert_eq!(parse_timestamp("01:02.34"), Some(62_340));
        assert_eq!(parse_timestamp("01:02.345"), Some(62_345));
        assert_eq!(parse_timestamp("1:02.34"), Some(62_340));
        // separador ":" nos centésimos também circula por aí
        assert_eq!(parse_timestamp("01:02:34"), Some(62_340));
    }

    #[test]
    fn rejects_impossible_timestamps() {
        assert_eq!(parse_timestamp("01:75"), None);
        assert_eq!(parse_timestamp("abc"), None);
        assert_eq!(parse_timestamp("ti:Titulo"), None);
        assert_eq!(parse_timestamp("01:02."), None);
    }

    #[test]
    fn one_line_per_timestamp_when_repeated() {
        let p = lrc("[00:10.00][01:20.00]linha repetida\n[02:00.00]outra");
        assert_eq!(p.kind, LyricsKind::Synced);
        assert_eq!(spoken(&p), vec!["linha repetida", "linha repetida", "outra"]);
        // Cada timestamp vira uma linha própria, com o seu tempo.
        let starts: Vec<i64> = p.lines.iter().filter(|l| !l.is_gap).map(|l| l.start_ms).collect();
        assert_eq!(starts, vec![10_000, 80_000, 120_000]);
    }

    #[test]
    fn file_offset_and_user_offset_add_up() {
        let body = "[offset:+500]\n[00:10.00]uma linha\n[00:20.00]outra linha";
        assert_eq!(parse(body, 0).lines[0].start_ms, 10_500);
        assert_eq!(parse(body, 250).lines[0].start_ms, 10_750);
        // negativo é válido e adianta a letra
        let neg = "[offset:-800]\n[00:10.00]uma linha\n[00:20.00]outra linha";
        assert_eq!(parse(neg, 0).lines[0].start_ms, 9_200);
        assert_eq!(parse(neg, -200).lines[0].start_ms, 9_000);
    }

    #[test]
    fn out_of_order_lines_are_sorted() {
        let p = lrc("[00:30.00]terceira\n[00:10.00]primeira\n[00:20.00]segunda");
        assert_eq!(spoken(&p), vec!["primeira", "segunda", "terceira"]);
    }

    #[test]
    fn duplicate_timestamps_keep_reading_order() {
        let p = lrc("[00:10.00]alfa\n[00:10.00]beta\n[00:20.00]gama");
        assert_eq!(spoken(&p), vec!["alfa", "beta", "gama"]);
    }

    #[test]
    fn empty_text_becomes_a_gap() {
        let p = lrc("[00:10.00]com texto\n[00:12.00]\n[00:14.00]de novo");
        assert!(!p.lines[0].is_gap);
        assert!(p.lines[1].is_gap);
    }

    #[test]
    fn long_silence_gets_a_synthetic_gap_line() {
        let p = lrc("[00:00.00]antes\n[00:30.00]depois");
        assert_eq!(p.lines.len(), 3, "esperava a linha sintética no meio");
        assert!(p.lines[1].is_gap);
        // A primeira metade do vão ainda pertence à linha anterior; só a
        // segunda é tratada como instrumental.
        assert_eq!(p.lines[1].start_ms, 15_000);
        assert_eq!(p.lines[1].end_ms, 30_000);
        // vão curto não gera linha
        let short = lrc("[00:00.00]antes\n[00:03.00]depois");
        assert_eq!(short.lines.len(), 2);
    }

    #[test]
    fn end_of_each_line_is_the_start_of_the_next() {
        let p = lrc("[00:01.00]um\n[00:03.00]dois\n[00:05.00]tres");
        assert_eq!(p.lines[0].end_ms, 3_000);
        assert_eq!(p.lines[1].end_ms, 5_000);
    }

    #[test]
    fn last_line_is_closed_with_the_track_duration() {
        let mut p = lrc("[00:01.00]um\n[00:03.00]dois");
        close_with_duration(&mut p.lines, Some(9_000));
        assert_eq!(p.lines.last().unwrap().end_ms, 9_000);
        // duração ausente ou incoerente cai num fim razoável
        let mut q = lrc("[00:01.00]um\n[00:03.00]dois");
        close_with_duration(&mut q.lines, None);
        assert_eq!(q.lines.last().unwrap().end_ms, 8_000);
    }

    #[test]
    fn enhanced_lrc_fills_word_timings() {
        let p = lrc("[00:12.00] <00:12.00>uma <00:12.40>palavra <00:12.90>por vez");
        let line = &p.lines[0];
        assert_eq!(line.text, "uma palavra por vez");
        let words = line.words.as_ref().expect("esperava tempos por palavra");
        assert_eq!(words.len(), 3);
        assert_eq!(words[0].start_ms, 12_000);
        assert_eq!(words[1].start_ms, 12_400);
        assert_eq!(words[0].end_ms, 12_400, "palavra termina onde a próxima começa");
        assert_eq!(words[2].text, "por vez");
    }

    #[test]
    fn text_without_timestamps_is_plain() {
        let p = lrc("primeira linha\nsegunda linha\nterceira linha");
        assert_eq!(p.kind, LyricsKind::Plain);
        assert_eq!(p.lines.len(), 3);
        assert!(p.plain_text.is_some());
        assert!(p.lines.iter().all(|l| l.start_ms == 0));
    }

    #[test]
    fn metadata_only_file_is_not_lyrics() {
        let p = lrc("[ti:Titulo]\n[ar:Artista]\n[al:Album]\n[by:Alguem]\n[length:03:20]");
        assert_eq!(p.kind, LyricsKind::Plain);
        assert!(p.lines.is_empty());
    }

    #[test]
    fn handles_bom_and_crlf() {
        let p = lrc("\u{feff}[00:01.00]primeira\r\n[00:02.00]segunda\r\n");
        assert_eq!(p.kind, LyricsKind::Synced);
        assert_eq!(p.lines[0].text, "primeira");
        assert_eq!(p.lines[1].text, "segunda");
    }

    #[test]
    fn falls_back_to_latin1_when_not_utf8() {
        // 0xE7 é "ç" em Latin-1 e sequência inválida em UTF-8. Sem o fallback,
        // o texto viraria bytes perdidos em vez de acentuação correta.
        let bytes = [b'c', b'a', b'n', 0xE7, b'a', b'o'];
        assert_eq!(decode_text(&bytes), "cançao");
        // e o caminho UTF-8 segue intacto
        assert_eq!(decode_text("coração".as_bytes()), "coração");
    }

    #[test]
    fn normalize_ignores_case_accent_and_punctuation() {
        assert_eq!(normalize("Coração!!!"), "coracao");
        assert_eq!(normalize("  ESSE   é   o  refrão... "), "esse e o refrao");
        assert_eq!(normalize("Não, não!"), "nao nao");
    }

    #[test]
    fn detects_a_repeated_block_as_chorus() {
        let p = lrc(
            "[00:01.00]verso um aqui\n[00:03.00]verso dois aqui\n\
             [00:05.00]bloco que repete\n[00:07.00]segunda do bloco\n\
             [00:09.00]verso tres aqui\n[00:11.00]verso quatro aqui\n\
             [00:13.00]bloco que repete\n[00:15.00]segunda do bloco",
        );
        let chorus: Vec<usize> = p.lines.iter().enumerate().filter(|(_, l)| l.is_chorus).map(|(i, _)| i).collect();
        assert_eq!(chorus, vec![2, 3, 6, 7]);
        // as duas ocorrências pertencem ao mesmo grupo
        assert_eq!(p.lines[2].chorus_id, p.lines[6].chorus_id);
        assert_eq!(p.lines[2].chorus_id, Some(1));
    }

    #[test]
    fn chorus_matches_across_punctuation_and_accent() {
        let p = lrc(
            "[00:01.00]abre o verso inicial\n[00:03.00]segue o verso inicial\n\
             [00:05.00]Vem comigo, então!\n[00:07.00]Nao para nunca\n\
             [00:09.00]outro verso diferente\n[00:11.00]mais um verso ali\n\
             [00:13.00]vem comigo entao\n[00:15.00]Não pára nunca...",
        );
        assert!(p.lines[2].is_chorus && p.lines[6].is_chorus);
        assert_eq!(p.lines[2].chorus_id, p.lines[6].chorus_id);
    }

    #[test]
    fn no_chorus_when_nothing_repeats() {
        let p = lrc(
            "[00:01.00]cada linha unica\n[00:03.00]nenhuma se repete\n\
             [00:05.00]texto sempre novo\n[00:07.00]nada volta aqui\n\
             [00:09.00]seguindo em frente\n[00:11.00]sem nenhum eco",
        );
        assert!(p.lines.iter().all(|l| !l.is_chorus), "não deve forçar refrão");
    }

    #[test]
    fn no_chorus_in_a_four_line_song() {
        let p = lrc("[00:01.00]linha um\n[00:03.00]linha dois\n[00:05.00]linha um\n[00:07.00]linha dois");
        // 4 linhas: repetição existe, mas a letra é curta demais para afirmar
        // que aquilo é um refrão em vez de a música inteira.
        assert!(p.lines.iter().all(|l| !l.is_chorus));
    }

    #[test]
    fn single_repeated_line_is_not_a_chorus() {
        // Refrão exige bloco de ≥2 linhas; uma linha solta que volta não conta.
        let p = lrc(
            "[00:01.00]abre a musica\n[00:03.00]refrao solto\n[00:05.00]segue o verso\n\
             [00:07.00]mais um verso\n[00:09.00]refrao solto\n[00:11.00]termina aqui",
        );
        assert!(p.lines.iter().all(|l| !l.is_chorus));
    }

    #[test]
    fn chorus_detection_works_on_plain_lyrics_too() {
        let p = lrc(
            "abre o verso inicial\nsegue o verso inicial\n\
             bloco que repete\nsegunda do bloco\n\
             outro verso diferente\nmais um verso ali\n\
             bloco que repete\nsegunda do bloco",
        );
        assert_eq!(p.kind, LyricsKind::Plain);
        assert!(p.lines[2].is_chorus && p.lines[6].is_chorus);
    }

    // ── Casos lidos das fixtures ──────────────────────────────────────────
    // Ficam em arquivo, e não inline, porque codificação (Latin-1), quebra de
    // linha (CRLF) e BOM não sobrevivem a um literal Rust — o compilador
    // normalizaria tudo para UTF-8 e o teste passaria sem testar nada.

    fn fixture(name: &str) -> Vec<u8> {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/lyrics")
            .join(name);
        std::fs::read(&path).unwrap_or_else(|e| panic!("fixture {name}: {e}"))
    }

    fn fixture_parsed(name: &str) -> ParsedLyrics {
        parse(&decode_text(&fixture(name)), 0)
    }

    #[test]
    fn fixture_synced_file_is_fully_understood() {
        let p = fixture_parsed("sincronizada.lrc");
        assert_eq!(p.kind, LyricsKind::Synced);
        assert_eq!(p.file_offset_ms, 250, "[offset:] do arquivo foi lido");
        // Primeira fala em 00:01.00, deslocada pelo offset do arquivo.
        assert_eq!(p.lines[0].start_ms, 1_250);
        // Metadados ([ti:], [ar:], ...) nao viram linhas de letra.
        assert!(p.lines.iter().all(|l| !l.text.starts_with("Passo")));
        // O bloco final repete o do meio -> refrao marcado nas duas ocorrencias.
        let groups: Vec<i64> = p.lines.iter().filter_map(|l| l.chorus_id).collect();
        assert!(groups.len() >= 4, "esperava as duas ocorrencias marcadas");
        assert!(groups.iter().all(|g| *g == groups[0]), "mesmo grupo de refrao");
        // O silencio de 00:25 a 00:40 vira linha de intervalo.
        assert!(p.lines.iter().any(|l| l.is_gap), "esperava o trecho instrumental");
    }

    #[test]
    fn fixture_enhanced_file_has_word_timings() {
        let p = fixture_parsed("enhanced.lrc");
        let first = &p.lines[0];
        assert_eq!(first.text, "cada palavra no seu tempo");
        let words = first.words.as_ref().expect("esperava tempos por palavra");
        assert_eq!(words.len(), 5);
        assert_eq!(words[0].start_ms, 5_000);
        assert_eq!(words[4].text, "tempo");
    }

    #[test]
    fn fixture_untimed_file_is_plain() {
        let p = fixture_parsed("sem-tempo.txt");
        assert_eq!(p.kind, LyricsKind::Plain);
        assert_eq!(p.lines.len(), 4);
        assert!(p.lines[2].is_gap, "a linha em branco vira intervalo");
    }

    #[test]
    fn fixture_malformed_file_degrades_instead_of_failing() {
        let p = fixture_parsed("malformado.lrc");
        assert_eq!(p.kind, LyricsKind::Synced);
        let texts = spoken(&p);
        // Ordenado por tempo, apesar da ordem do arquivo.
        assert_eq!(texts[0], "essa vem primeiro");
        // Marcas iguais mantem a ordem de leitura.
        assert_eq!(texts[1], "essa fica no meio");
        assert_eq!(texts[2], "mesma marca, ordem preservada");
        assert_eq!(texts.last().copied(), Some("essa vem por ultimo"));
        // Colchete nao-temporal e minuto impossivel sao descartados, nao quebram.
        assert!(!texts.iter().any(|t| t.contains("colchete invalido")));
        assert!(!texts.iter().any(|t| t.contains("impossivel")));
    }

    #[test]
    fn fixture_latin1_with_crlf_is_decoded() {
        let raw = fixture("latin1-crlf.lrc");
        assert!(std::str::from_utf8(&raw).is_err(), "a fixture precisa ser Latin-1");
        let p = fixture_parsed("latin1-crlf.lrc");
        assert_eq!(p.kind, LyricsKind::Synced);
        assert!(p.lines[0].text.contains('\u{e7}'), "acento preservado: {}", p.lines[0].text);
        assert!(!p.lines[0].text.contains('\r'), "CRLF normalizado");
    }

    #[test]
    fn indices_are_sequential_after_synthetic_lines() {
        let p = lrc("[00:00.00]antes\n[00:30.00]depois\n[00:32.00]fim");
        let idx: Vec<i64> = p.lines.iter().map(|l| l.index).collect();
        assert_eq!(idx, vec![0, 1, 2, 3]);
    }
}
