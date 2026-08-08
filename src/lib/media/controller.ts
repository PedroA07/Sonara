import { AudioBackend } from "./AudioBackend";
import { VideoBackend } from "./VideoBackend";
import {
  domElementFactory, waitCanPlay, CANPLAY_TIMEOUT_MS,
  type ElementFactory, type MediaBackend, type MediaHooks, type MediaMode,
} from "./MediaBackend";

export interface SwitchRequest {
  /** Arquivo a tocar no novo modo (áudio ou vídeo da mesma faixa). */
  src: string;
  /** Onde a música está agora, em ms — vem do store (ADR-01). */
  positionMs: number;
  wasPlaying: boolean;
  /** Calibração de lipsync da faixa, somada só na entrada do vídeo. */
  offsetMs?: number;
  /** Volume final já calculado (base × ReplayGain, 0 se mudo). */
  volume: number;
  /** Sobrescreve o limite de espera do `canplay` (usado nos testes). */
  timeoutMs?: number;
}

export type SwitchResult =
  | { ok: true; mode: MediaMode; positionMs: number }
  | { ok: false; mode: MediaMode; error: string };

/**
 * Dono do backend ativo e da troca entre eles.
 *
 * A sequência de troca mora aqui, e não no componente, por dois motivos: ela
 * precisa acontecer inteira mesmo que o React re-renderize no meio, e precisa
 * ser testável sem DOM. O store guarda só o *modo* desejado; quem sabe abrir,
 * posicionar e destruir elementos é esta classe.
 */
export class MediaController {
  private backend: MediaBackend | null = null;
  private factory: ElementFactory;
  private hooks: MediaHooks;

  constructor(hooks: MediaHooks = {}, factory: ElementFactory = domElementFactory) {
    this.hooks = hooks;
    this.factory = factory;
  }

  get current(): MediaBackend | null {
    return this.backend;
  }

  get mode(): MediaMode | null {
    return this.backend?.mode ?? null;
  }

  /** O backend de áudio, quando é ele que está ativo — para crossfade/preload. */
  get audio(): AudioBackend | null {
    return this.backend instanceof AudioBackend ? this.backend : null;
  }

  private create(mode: MediaMode): MediaBackend {
    return mode === "video"
      ? new VideoBackend(this.hooks, this.factory)
      : new AudioBackend(this.hooks, this.factory);
  }

  /** Garante um backend do modo pedido, sem preservar posição (primeira carga). */
  ensure(mode: MediaMode): MediaBackend {
    if (this.backend?.mode === mode) return this.backend;
    this.backend?.destroy();
    this.backend = this.create(mode);
    return this.backend;
  }

  /**
   * Troca de modo preservando o ponto da música (§6.2).
   *
   * A ordem importa e é esta:
   *
   * 1. congela `positionMs` e se estava tocando;
   * 2. pausa o backend atual — mas **não** o destrói ainda;
   * 3. monta o novo e espera `canplay` (4 s de teto);
   * 4. posiciona em `t + offset`;
   * 5. só então dá play e deixa a tela trocar;
   * 6. destrói o antigo.
   *
   * O passo 2 antes do 3 é o que evita dois decodes simultâneos; o 6 depois do
   * 5 é o que evita o buraco de som entre o pause de um e o play do outro. Se
   * qualquer coisa falhar antes do 5, o backend antigo ainda está inteiro e a
   * reprodução volta para ele — a pessoa não perde a música por causa de um
   * vídeo que não abriu.
   */
  async switchTo(mode: MediaMode, req: SwitchRequest): Promise<SwitchResult> {
    const previous = this.backend;
    if (previous?.mode === mode) {
      return { ok: true, mode, positionMs: previous.currentMs() };
    }

    const target = req.positionMs + (mode === "video" ? (req.offsetMs ?? 0) : 0);
    previous?.pause();

    const next = this.create(mode);
    try {
      await next.load(req.src, 0);
      await waitCanPlay(next.element, req.timeoutMs ?? CANPLAY_TIMEOUT_MS);
      next.setVolume(req.volume);
      next.seek(Math.max(0, target));
      if (req.wasPlaying) await next.play();
    } catch (e) {
      // Nada mudou de verdade: desfaz o novo e devolve a palavra ao antigo.
      next.destroy();
      if (previous && req.wasPlaying) void previous.play();
      return {
        ok: false,
        mode: previous?.mode ?? "audio",
        error: e instanceof Error ? e.message : String(e),
      };
    }

    this.backend = next;
    previous?.destroy();
    return { ok: true, mode, positionMs: next.currentMs() };
  }

  destroy(): void {
    this.backend?.destroy();
    this.backend = null;
  }
}
