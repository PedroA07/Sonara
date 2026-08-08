import type { LyricLine, Lyrics } from "../types";

/**
 * Funções puras da visão de letra. Ficam fora do componente porque rodam a cada
 * quadro de animação e porque é o que dá para testar sem montar React.
 */

/**
 * Índice da linha que está tocando em `positionMs`.
 *
 * Busca binária: uma letra pode ter centenas de linhas e isto roda a 60 fps.
 * Uma varredura linear seria O(n) por quadro — 200 linhas × 60 = 12 mil
 * comparações por segundo para uma resposta que muda uma vez a cada 3 s.
 *
 * Devolve -1 antes da primeira linha (intro instrumental), e nunca passa da
 * última.
 */
export function activeLineIndex(lines: LyricLine[], positionMs: number): number {
  if (lines.length === 0 || positionMs < lines[0].startMs) return -1;

  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid].startMs <= positionMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Progresso dentro da linha ativa, de 0 a 1.
 *
 * Alimenta o preenchimento palavra a palavra sem re-render: o componente grava
 * isto numa CSS custom property.
 */
export function lineProgress(line: LyricLine | undefined, positionMs: number): number {
  if (!line) return 0;
  const span = line.endMs - line.startMs;
  if (span <= 0) return positionMs >= line.startMs ? 1 : 0;
  return Math.min(1, Math.max(0, (positionMs - line.startMs) / span));
}

/** Índice da palavra sendo cantada, ou -1 quando a linha não tem tempo por palavra. */
export function activeWordIndex(line: LyricLine | undefined, positionMs: number): number {
  if (!line?.words?.length) return -1;
  const words = line.words;
  if (positionMs < words[0].startMs) return -1;
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (words[mid].startMs <= positionMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Próxima (ou anterior) ocorrência de refrão a partir da linha atual.
 *
 * "Ocorrência" é o **início de um bloco**, não qualquer linha marcada: pular
 * para o meio de um refrão não ajuda ninguém a acompanhar.
 */
export function chorusStarts(lines: LyricLine[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].isChorus) continue;
    const prev = lines[i - 1];
    if (!prev?.isChorus || prev.chorusId !== lines[i].chorusId) starts.push(i);
  }
  return starts;
}

/** Índice da linha para onde `Shift + ↓ / ↑` deve saltar, ou null se não houver. */
export function nextChorus(
  lines: LyricLine[],
  fromIndex: number,
  direction: 1 | -1
): number | null {
  const starts = chorusStarts(lines);
  if (starts.length === 0) return null;
  if (direction === 1) return starts.find((i) => i > fromIndex) ?? null;
  const before = starts.filter((i) => i < fromIndex);
  return before.length ? before[before.length - 1] : null;
}

/**
 * A letra tem tempo utilizável?
 *
 * `kind === "synced"` não basta: um arquivo sincronizado sem nenhuma linha é
 * sincronizado no papel e inútil na tela.
 */
export function isFollowable(lyrics: Lyrics | null | undefined): boolean {
  return !!lyrics && lyrics.kind === "synced" && lyrics.lines.some((l) => !l.isGap);
}

/** Valida um LRC colado no editor, devolvendo os números das linhas com problema. */
export function validateLrc(text: string): { line: number; reason: string }[] {
  const problems: { line: number; reason: string }[] = [];
  const lines = text.split("\n");
  let anyTimestamp = false;

  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t || !t.startsWith("[")) return;
    const end = t.indexOf("]");
    if (end < 0) {
      problems.push({ line: i + 1, reason: "colchete não fechado" });
      return;
    }
    const tag = t.slice(1, end);
    // Metadado conhecido: [ti:], [ar:], [offset:]…
    if (/^[a-z]+:/i.test(tag) && !/^\d/.test(tag)) return;
    if (parseTimestampMs(tag) === null) {
      problems.push({ line: i + 1, reason: `tempo inválido: "${tag}"` });
    } else {
      anyTimestamp = true;
    }
  });

  if (!anyTimestamp && text.trim() && text.includes("[")) {
    problems.push({ line: 0, reason: "nenhum tempo válido — a letra ficará sem sincronia" });
  }
  return problems;
}

/** `mm:ss[.xx]` → ms. Espelha o parser do core; usado só para validar no editor. */
export function parseTimestampMs(tag: string): number | null {
  const m = tag.trim().match(/^(\d+):([0-5]?\d)(?:[.:](\d{1,3}))?$/);
  if (!m) return null;
  const [, mm, ss, frac] = m;
  let ms = 0;
  if (frac) {
    ms = frac.length === 1 ? Number(frac) * 100 : frac.length === 2 ? Number(frac) * 10 : Number(frac);
  }
  return Number(mm) * 60_000 + Number(ss) * 1_000 + ms;
}

/** ms → `[mm:ss.xx]`, para o botão "Marcar tempo" do editor. */
export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const mm = Math.floor(total / 60_000);
  const ss = Math.floor((total % 60_000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `[${pad(mm)}:${pad(ss)}.${pad(cs)}]`;
}
