import { describe, expect, it } from "vitest";
import type { LyricLine, Lyrics } from "../types";
import {
  activeLineIndex,
  activeWordIndex,
  chorusStarts,
  formatTimestamp,
  isFollowable,
  lineProgress,
  nextChorus,
  parseTimestampMs,
  validateLrc,
} from "./lyrics";

// Texto inventado, pelo mesmo motivo das fixtures do core: nada de letra real
// versionada no repositório.
function line(partial: Partial<LyricLine> & { startMs: number; endMs: number }): LyricLine {
  return {
    index: 0,
    text: "linha",
    isChorus: false,
    isGap: false,
    ...partial,
  };
}

const three = [
  line({ startMs: 1_000, endMs: 3_000, text: "um" }),
  line({ startMs: 3_000, endMs: 5_000, text: "dois" }),
  line({ startMs: 5_000, endMs: 9_000, text: "tres" }),
];

describe("activeLineIndex", () => {
  it("devolve -1 antes da primeira linha", () => {
    expect(activeLineIndex(three, 0)).toBe(-1);
    expect(activeLineIndex(three, 999)).toBe(-1);
  });

  it("acerta o início exato de cada linha", () => {
    expect(activeLineIndex(three, 1_000)).toBe(0);
    expect(activeLineIndex(three, 3_000)).toBe(1);
    expect(activeLineIndex(three, 5_000)).toBe(2);
  });

  it("mantém a linha até o instante anterior à próxima", () => {
    expect(activeLineIndex(three, 2_999)).toBe(0);
    expect(activeLineIndex(three, 4_999)).toBe(1);
  });

  it("não passa da última linha", () => {
    expect(activeLineIndex(three, 999_999)).toBe(2);
  });

  it("lida com letra de uma linha só e com letra vazia", () => {
    const one = [line({ startMs: 2_000, endMs: 8_000 })];
    expect(activeLineIndex(one, 0)).toBe(-1);
    expect(activeLineIndex(one, 2_000)).toBe(0);
    expect(activeLineIndex(one, 60_000)).toBe(0);
    expect(activeLineIndex([], 1_000)).toBe(-1);
  });

  it("concorda com a varredura linear em toda a faixa", () => {
    // A busca binária só vale se der exatamente a mesma resposta da versão
    // óbvia — este é o teste que garante a equivalência.
    const linear = (ls: LyricLine[], ms: number) => {
      let found = -1;
      for (let i = 0; i < ls.length; i++) if (ls[i].startMs <= ms) found = i;
      return found;
    };
    const many = Array.from({ length: 200 }, (_, i) =>
      line({ startMs: i * 1_700, endMs: (i + 1) * 1_700 })
    );
    for (let ms = 0; ms < 200 * 1_700 + 5_000; ms += 137) {
      expect(activeLineIndex(many, ms)).toBe(linear(many, ms));
    }
  });
});

describe("lineProgress", () => {
  it("vai de 0 a 1 dentro da linha", () => {
    const l = line({ startMs: 1_000, endMs: 3_000 });
    expect(lineProgress(l, 1_000)).toBe(0);
    expect(lineProgress(l, 2_000)).toBe(0.5);
    expect(lineProgress(l, 3_000)).toBe(1);
  });

  it("satura fora dos limites e não divide por zero", () => {
    const l = line({ startMs: 1_000, endMs: 3_000 });
    expect(lineProgress(l, 0)).toBe(0);
    expect(lineProgress(l, 99_000)).toBe(1);
    // Linha de duração zero acontece na última linha sem duração conhecida.
    const zero = line({ startMs: 5_000, endMs: 5_000 });
    expect(lineProgress(zero, 4_000)).toBe(0);
    expect(lineProgress(zero, 5_000)).toBe(1);
    expect(lineProgress(undefined, 1_000)).toBe(0);
  });
});

describe("activeWordIndex", () => {
  const withWords = line({
    startMs: 1_000,
    endMs: 4_000,
    words: [
      { startMs: 1_000, endMs: 1_500, text: "uma" },
      { startMs: 1_500, endMs: 2_200, text: "outra" },
      { startMs: 2_200, endMs: 4_000, text: "final" },
    ],
  });

  it("segue as palavras e devolve -1 antes da primeira", () => {
    expect(activeWordIndex(withWords, 900)).toBe(-1);
    expect(activeWordIndex(withWords, 1_000)).toBe(0);
    expect(activeWordIndex(withWords, 1_499)).toBe(0);
    expect(activeWordIndex(withWords, 1_500)).toBe(1);
    expect(activeWordIndex(withWords, 9_000)).toBe(2);
  });

  it("devolve -1 quando a linha não tem tempo por palavra", () => {
    expect(activeWordIndex(three[0], 2_000)).toBe(-1);
    expect(activeWordIndex(undefined, 2_000)).toBe(-1);
  });
});

describe("navegação por refrão", () => {
  // verso, verso, REFRÃO(2), verso, REFRÃO(2)
  const song = [
    line({ startMs: 0, endMs: 1_000 }),
    line({ startMs: 1_000, endMs: 2_000 }),
    line({ startMs: 2_000, endMs: 3_000, isChorus: true, chorusId: 1 }),
    line({ startMs: 3_000, endMs: 4_000, isChorus: true, chorusId: 1 }),
    line({ startMs: 4_000, endMs: 5_000 }),
    line({ startMs: 5_000, endMs: 6_000, isChorus: true, chorusId: 1 }),
    line({ startMs: 6_000, endMs: 7_000, isChorus: true, chorusId: 1 }),
  ];

  it("lista só os inícios de bloco, não toda linha marcada", () => {
    expect(chorusStarts(song)).toEqual([2, 5]);
  });

  it("salta para a próxima e para a anterior ocorrência", () => {
    expect(nextChorus(song, 0, 1)).toBe(2);
    expect(nextChorus(song, 2, 1)).toBe(5);
    expect(nextChorus(song, 5, 1)).toBeNull();
    expect(nextChorus(song, 6, -1)).toBe(5);
    expect(nextChorus(song, 3, -1)).toBe(2);
    expect(nextChorus(song, 0, -1)).toBeNull();
  });

  it("não quebra em letra sem refrão", () => {
    expect(chorusStarts(three)).toEqual([]);
    expect(nextChorus(three, 0, 1)).toBeNull();
  });
});

describe("isFollowable", () => {
  const make = (over: Partial<Lyrics>): Lyrics => ({
    trackId: 1, kind: "synced", source: "manual", offsetMs: 0, lines: three, ...over,
  });

  it("aceita letra sincronizada com falas", () => {
    expect(isFollowable(make({}))).toBe(true);
  });

  it("recusa letra simples, instrumental, vazia ou ausente", () => {
    expect(isFollowable(make({ kind: "plain" }))).toBe(false);
    expect(isFollowable(make({ kind: "instrumental", lines: [] }))).toBe(false);
    expect(isFollowable(make({ lines: [] }))).toBe(false);
    // Sincronizada só com intervalos é sincronizada no papel e inútil na tela.
    expect(isFollowable(make({ lines: [line({ startMs: 0, endMs: 1, isGap: true })] }))).toBe(false);
    expect(isFollowable(null)).toBe(false);
  });
});

describe("timestamps do editor", () => {
  it("lê as formas aceitas", () => {
    expect(parseTimestampMs("01:02")).toBe(62_000);
    expect(parseTimestampMs("01:02.5")).toBe(62_500);
    expect(parseTimestampMs("01:02.34")).toBe(62_340);
    expect(parseTimestampMs("01:02.345")).toBe(62_345);
  });

  it("recusa o que não é tempo", () => {
    expect(parseTimestampMs("01:75")).toBeNull();
    expect(parseTimestampMs("ti:Titulo")).toBeNull();
    expect(parseTimestampMs("abc")).toBeNull();
  });

  it("formata de volta com dois dígitos", () => {
    expect(formatTimestamp(62_340)).toBe("[01:02.34]");
    expect(formatTimestamp(0)).toBe("[00:00.00]");
    expect(formatTimestamp(-500)).toBe("[00:00.00]");
  });

  it("ida e volta preserva o centésimo", () => {
    for (const ms of [0, 999, 62_340, 3_599_990]) {
      const tag = formatTimestamp(ms).slice(1, -1);
      expect(parseTimestampMs(tag)).toBe(Math.floor(ms / 10) * 10);
    }
  });
});

describe("validateLrc", () => {
  it("não reclama de um arquivo válido", () => {
    expect(validateLrc("[ti:Titulo]\n[00:01.00]primeira\n[00:05.00]segunda")).toEqual([]);
  });

  it("aponta a linha do tempo inválido", () => {
    const problems = validateLrc("[00:01.00]ok\n[00:99.00]ruim");
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(2);
  });

  it("aponta colchete não fechado", () => {
    expect(validateLrc("[00:01.00 sem fechar")[0].reason).toContain("colchete");
  });

  it("avisa quando não há nenhum tempo válido", () => {
    const problems = validateLrc("[xx]nada aqui");
    expect(problems.some((p) => p.reason.includes("sem sincronia"))).toBe(true);
  });

  it("aceita texto puro sem colchete nenhum", () => {
    expect(validateLrc("so texto\noutra linha")).toEqual([]);
  });
});
