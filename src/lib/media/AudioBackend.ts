import {
  cancelFrame, domElementFactory, elementDurationMs, mediaErrorMessage, onNextFrame, toSeconds,
  type ElementFactory, type MediaBackend, type MediaHooks,
} from "./MediaBackend";

/**
 * Backend de áudio — dois `<audio>` por dentro, um só por fora.
 *
 * Os dois elementos existem para o crossfade e para o pré-carregamento da
 * próxima faixa. Isso é detalhe interno (ADR-02): quem usa o backend vê um
 * `element`, um `currentMs()` e um `setVolume()`, e não precisa saber qual slot
 * está tocando.
 *
 * Os elementos são criados aqui, e não renderizados em JSX, porque a vida deles
 * passou a ser a vida do backend: um `destroy()` precisa parar o decode de
 * verdade, e um elemento que o React ainda tem na árvore continuaria vivo.
 */
export class AudioBackend implements MediaBackend {
  readonly mode = "audio" as const;

  private slots: [HTMLMediaElement, HTMLMediaElement];
  private active = 0;
  /** Crossfade em andamento: o volume é do fade, não do controle da pessoa. */
  private fading = false;
  /** O crossfade já pediu a próxima faixa; o `ended` do slot velho é ruído. */
  private advancing = false;
  private raf = 0;
  private hooks: MediaHooks;
  private volume = 1;
  private destroyed = false;

  constructor(hooks: MediaHooks = {}, factory: ElementFactory = domElementFactory) {
    this.hooks = hooks;
    this.slots = [factory("audio"), factory("audio")];
    this.slots.forEach((el, i) => {
      el.preload = "auto";
      el.addEventListener("loadedmetadata", () => {
        if (i === this.active) this.hooks.onDurationMs?.(elementDurationMs(el));
      });
      el.addEventListener("ended", () => {
        if (i !== this.active || this.advancing) return;
        this.hooks.onEnded?.();
      });
      el.addEventListener("error", () => {
        if (i === this.active) this.hooks.onError?.(mediaErrorMessage(el));
      });
    });
  }

  get element(): HTMLMediaElement {
    return this.slots[this.active];
  }

  private get idle(): HTMLMediaElement {
    return this.slots[1 - this.active];
  }

  async load(src: string, atMs = 0): Promise<void> {
    // A faixa pode já estar pronta no slot ocioso, pré-carregada pelo
    // `preloadNext` — nesse caso trocar de slot é instantâneo e sem gap.
    if (this.element.src !== src && this.idle.src === src) {
      this.active = 1 - this.active;
    } else if (this.element.src !== src) {
      this.element.src = src;
      this.element.load();
    }
    this.advancing = false;
    this.fading = false;
    this.element.volume = this.volume;
    if (atMs > 0) this.seek(atMs);
    const d = elementDurationMs(this.element);
    if (d > 0) this.hooks.onDurationMs?.(d);
  }

  /** Deixa a próxima faixa carregada no slot ocioso (gapless e crossfade). */
  preloadNext(src: string | null): void {
    const want = src ?? "";
    if (this.idle.src !== want) {
      this.idle.src = want;
      this.idle.volume = 0;
    }
  }

  async play(): Promise<void> {
    try {
      await this.element.play();
    } catch {
      /* autoplay bloqueado ou troca de faixa no meio: o próximo clique resolve */
    }
  }

  pause(): void {
    this.slots.forEach((el) => el.pause());
  }

  seek(ms: number): void {
    this.element.currentTime = toSeconds(ms);
  }

  currentMs(): number {
    return Math.round(this.element.currentTime * 1000);
  }

  durationMs(): number {
    return elementDurationMs(this.element);
  }

  setVolume(v: number): void {
    this.volume = v;
    // Durante o fade o volume é dirigido pela animação; sobrescrever aqui daria
    // um salto audível no meio da transição.
    if (!this.fading) this.element.volume = v;
  }

  /**
   * Sobrepõe o fim da faixa atual com o começo da próxima.
   *
   * `onAdvance` é chamado quando o fade termina — é a hora de a fila avançar,
   * e não antes, senão a faixa seguinte trocaria de slot no meio da transição.
   */
  startCrossfade(seconds: number, targetVolume: number, onAdvance: () => void): void {
    const from = this.element;
    const to = this.idle;
    if (this.fading || !to.src) return;

    this.fading = true;
    this.advancing = true;
    const duration = Math.max(0.1, seconds) * 1000;
    const startVolume = from.volume;
    to.currentTime = 0;
    to.volume = 0;
    void to.play().catch(() => {});

    const t0 = performance.now();
    const step = () => {
      if (this.destroyed) return;
      const k = Math.min(1, (performance.now() - t0) / duration);
      from.volume = startVolume * (1 - k);
      to.volume = targetVolume * k;
      if (k < 1) {
        this.raf = onNextFrame(step);
      } else {
        from.pause();
        onAdvance();
      }
    };
    this.raf = onNextFrame(step);
  }

  /** Já está sobrepondo agora? A barra usa para não pedir dois fades. */
  isCrossfading(): boolean {
    return this.fading;
  }

  /** Quanto falta para o fim da faixa ativa, em segundos. */
  remainingSec(): number {
    const el = this.element;
    return Number.isFinite(el.duration) ? el.duration - el.currentTime : Infinity;
  }

  destroy(): void {
    this.destroyed = true;
    cancelFrame(this.raf);
    this.slots.forEach((el) => {
      el.pause();
      // `removeAttribute` e não `src = ""`: string vazia faz o webview tentar
      // carregar a própria página como mídia e disparar um erro falso.
      el.removeAttribute("src");
      el.load();
    });
  }
}
