import { describe, expect, it, vi } from "vitest";
import { MediaController } from "./controller";
import type { ElementFactory } from "./MediaBackend";

/**
 * Elemento de mídia falso.
 *
 * O ambiente de teste é Node: não há `HTMLMediaElement`, e um `<video>` de
 * verdade nunca dispararia `canplay` sem um arquivo. O falso implementa só o
 * que o backend usa — `currentTime`, `play`, `pause`, `readyState` e os
 * eventos — e é o que permite testar a *sequência* da troca, que é onde os
 * erros de verdade moram.
 */
class FakeMedia {
  src = "";
  currentTime = 0;
  duration = 210;
  volume = 1;
  preload = "";
  controls = false;
  playsInline = false;
  paused = true;
  /** `HAVE_ENOUGH_DATA`: o `waitCanPlay` resolve na hora. */
  readyState = 4;
  error: { code: number } | null = null;
  className = "";
  parentElement: unknown = null;
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn());
  }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
  load() {}
  remove() {}
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
}

const factory = (made: FakeMedia[] = []): ElementFactory => () => {
  const el = new FakeMedia();
  made.push(el);
  return el as unknown as HTMLMediaElement;
};

/** O elemento que o backend considera ativo, já destipado para o falso. */
const activeOf = (c: MediaController) => c.current!.element as unknown as FakeMedia;

describe("MediaController", () => {
  it("preserva a posição na ida e na volta, dentro de 150 ms", async () => {
    const c = new MediaController({}, factory());
    c.ensure("audio");
    await c.current!.load("file:///song.m4a");
    c.current!.seek(93_400);

    const toVideo = await c.switchTo("video", {
      src: "file:///song.mp4",
      positionMs: 93_400,
      wasPlaying: true,
      volume: 1,
    });
    expect(toVideo.ok).toBe(true);
    expect(c.mode).toBe("video");
    expect(toVideo.ok && Math.abs(toVideo.positionMs - 93_400)).toBeLessThanOrEqual(150);

    const back = await c.switchTo("audio", {
      src: "file:///song.m4a",
      positionMs: 93_400,
      wasPlaying: true,
      volume: 1,
    });
    expect(back.ok).toBe(true);
    expect(c.mode).toBe("audio");
    expect(back.ok && Math.abs(back.positionMs - 93_400)).toBeLessThanOrEqual(150);
  });

  it("soma o offset de lipsync só na entrada do vídeo", async () => {
    const c = new MediaController({}, factory());
    c.ensure("audio");
    await c.current!.load("file:///song.m4a");

    await c.switchTo("video", {
      src: "file:///song.mp4",
      positionMs: 60_000,
      wasPlaying: false,
      offsetMs: 250,
      volume: 1,
    });
    expect(activeOf(c).currentTime).toBeCloseTo(60.25, 3);

    // Na volta o offset não entra de novo, senão a deriva se acumularia a cada
    // ida e volta entre as abas.
    await c.switchTo("audio", {
      src: "file:///song.m4a",
      positionMs: 60_250,
      wasPlaying: false,
      offsetMs: 250,
      volume: 1,
    });
    expect(activeOf(c).currentTime).toBeCloseTo(60.25, 3);
  });

  it("só existe um backend por vez — o anterior é destruído", async () => {
    const made: FakeMedia[] = [];
    const c = new MediaController({}, factory(made));
    c.ensure("audio");
    // O AudioBackend cria dois elementos (os slots do crossfade).
    expect(made).toHaveLength(2);

    await c.switchTo("video", {
      src: "file:///song.mp4", positionMs: 0, wasPlaying: true, volume: 1,
    });

    expect(made).toHaveLength(3);
    // Os dois de áudio ficaram sem src e pausados: o decode parou de verdade.
    expect(made[0].src).toBe("");
    expect(made[1].src).toBe("");
    expect(made[0].paused).toBe(true);
    expect(made[2].paused).toBe(false);
  });

  it("mantém o áudio quando o vídeo não abre a tempo", async () => {
    const made: FakeMedia[] = [];
    const c = new MediaController({}, factory(made));
    c.ensure("audio");
    await c.current!.load("file:///song.m4a");
    await c.current!.play();

    // O terceiro elemento é o do vídeo: sem dados prontos e sem evento algum,
    // só o timeout resolve.
    const slow: ElementFactory = () => {
      const el = new FakeMedia();
      el.readyState = 0;
      made.push(el);
      return el as unknown as HTMLMediaElement;
    };
    const c2 = new MediaController({}, slow);
    c2.ensure("audio");
    await c2.current!.load("file:///song.m4a");
    const audioEl = activeOf(c2);
    await c2.current!.play();

    const res = await c2.switchTo("video", {
      src: "file:///song.mp4",
      positionMs: 12_000,
      wasPlaying: true,
      volume: 1,
      timeoutMs: 10,
    });

    expect(res.ok).toBe(false);
    expect(res.mode).toBe("audio");
    expect(c2.mode).toBe("audio");
    // A música não parou: quem estava tocando volta a tocar.
    expect(audioEl.paused).toBe(false);
  });

  it("avisa quando o arquivo não decodifica, com a causa provável", async () => {
    const made: FakeMedia[] = [];
    let failNext = false;
    const broken: ElementFactory = () => {
      const el = new FakeMedia();
      if (failNext) { el.readyState = 0; el.error = { code: 4 }; }
      made.push(el);
      return el as unknown as HTMLMediaElement;
    };
    const c = new MediaController({}, broken);
    c.ensure("audio");
    // MEDIA_ERR_SRC_NOT_SUPPORTED — o caso do Linux sem os plugins do
    // GStreamer. O erro já está posto quando a espera começa, e é justamente
    // esse caso que não pode consumir o timeout inteiro antes de falhar.
    failNext = true;

    const res = await c.switchTo("video", {
      src: "file:///song.mp4", positionMs: 0, wasPlaying: false, volume: 1, timeoutMs: 5_000,
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("H.264");
  });

  it("trocar para o modo que já está ativo não recria nada", async () => {
    const made: FakeMedia[] = [];
    const c = new MediaController({}, factory(made));
    c.ensure("audio");
    await c.current!.load("file:///song.m4a");
    c.current!.seek(5_000);

    const res = await c.switchTo("audio", {
      src: "file:///song.m4a", positionMs: 5_000, wasPlaying: false, volume: 1,
    });

    expect(res.ok).toBe(true);
    expect(made).toHaveLength(2); // nenhum elemento novo
    expect(res.ok && res.positionMs).toBe(5_000);
  });

  it("avisa o fim da faixa uma vez só, pelo slot ativo", async () => {
    const made: FakeMedia[] = [];
    const onEnded = vi.fn();
    const c = new MediaController({ onEnded }, factory(made));
    c.ensure("audio");
    await c.current!.load("file:///song.m4a");

    // O slot ocioso terminando (pré-carga) não pode avançar a fila.
    made[1].emit("ended");
    expect(onEnded).not.toHaveBeenCalled();

    made[0].emit("ended");
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
