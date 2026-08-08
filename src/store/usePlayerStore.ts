import { create } from "zustand";
import type { Track, RepeatMode } from "../types";
import type { MediaMode } from "../lib/media/MediaBackend";
import { toast } from "./useToastStore";

/** Abas do "Tocando agora". */
export type Pane = "cover" | "lyrics" | "video";

/** A faixa tem vídeo baixado? */
export function hasVideo(track: Track | undefined): boolean {
  return !!track?.video_path && track.video_path.trim() !== "";
}

/**
 * Qual aba mostrar depois de trocar de faixa.
 *
 * A única regra é sobre a aba Vídeo: quem **estava assistindo** e cai numa
 * faixa sem vídeo ficaria olhando para um retângulo preto, então vai para a
 * Letra, que preserva o que a pessoa estava fazendo (acompanhar a música).
 *
 * `mediaMode` entra na conta porque a aba Vídeo também é onde mora a oferta de
 * baixar: quem está lá com o áudio tocando não estava assistindo a nada, e
 * empurrar essa pessoa para a Letra seria tirá-la de onde ela escolheu estar.
 */
export function paneAfterTrackChange(
  pane: Pane,
  track: Track | undefined,
  mediaMode: MediaMode
): Pane {
  if (pane !== "video" || mediaMode !== "video") return pane;
  return hasVideo(track) ? "video" : "lyrics";
}

/**
 * ADR-01 — o relógio da reprodução mora aqui, não no elemento de mídia.
 *
 * `positionMs` é a fonte de verdade única, alimentada a cada quadro de animação
 * pelo backend ativo (hoje o `<audio>` da PlayerBar). Quem quiser saber onde a
 * música está — a barra de progresso, a letra sincronizada, o vídeo — lê daqui,
 * e não do elemento. É isso que permite trocar áudio↔vídeo sem perder o ponto e
 * manter a letra estável.
 *
 * Milissegundos, e não segundos, porque a letra precisa de precisão abaixo do
 * segundo e `float` de segundos acumula erro ao ser somado e comparado.
 * Cuidado ao ler o código: `track.duration` continua em **segundos** — é o dado
 * do banco, uma coisa diferente do relógio.
 */
interface PlayerState {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  layout: "album" | "browse";
  /** Posição atual da reprodução, em ms. Atualizada ~60×/s. */
  positionMs: number;
  /** Duração da faixa ativa, em ms (0 enquanto os metadados não carregaram). */
  durationMs: number;
  volume: number;
  muted: boolean;
  /** Pedido de salto pendente, em ms — o backend consome e chama `clearSeek`. */
  seekReqMs: number | null;
  showQueue: boolean;     // right-hand queue panel visibility
  expanded: boolean;      // full-screen "now playing" view
  /** Aba do "Tocando agora". Mora aqui porque a troca de faixa pode mudá-la. */
  pane: Pane;
  /**
   * Backend que deve estar tocando (ADR-02). É um *desejo*: quem reconcilia com
   * o DOM é a PlayerBar, que pode falhar em abrir o vídeo e voltar para áudio.
   */
  mediaMode: MediaMode;
  /** Troca de backend em andamento — a aba Vídeo mostra o estado de carregando. */
  mediaSwitching: boolean;

  setQueue: (tracks: Track[], startAt?: number) => void;
  jumpTo: (index: number) => void;
  toggleQueue: () => void;
  setExpanded: (v: boolean) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  handleEnded: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleLayout: () => void;
  setPosition: (ms: number) => void;
  setDurationMs: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  requestSeek: (ms: number) => void;
  clearSeek: () => void;
  setPane: (p: Pane) => void;
  setMediaMode: (m: MediaMode) => void;
  setMediaSwitching: (v: boolean) => void;
}

/** Antes de quanto tempo o botão "anterior" volta de faixa em vez de reiniciar. */
const RESTART_THRESHOLD_MS = 3_000;

function pickNext(index: number, len: number, shuffle: boolean): number | null {
  if (len === 0) return null;
  if (shuffle) {
    if (len === 1) return index;
    let n = index;
    while (n === index) n = Math.floor(Math.random() * len);
    return n;
  }
  return index < len - 1 ? index + 1 : null;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  /**
   * Toda mudança de faixa passa por aqui.
   *
   * Centralizado porque a regra da aba Vídeo precisa valer para **todos** os
   * caminhos — próxima, anterior, clique na fila, fim da música, nova fila — e
   * repeti-la em cinco ações é a forma garantida de esquecer uma.
   */
  const moveTo = (index: number, queue?: Track[]) => {
    const s = get();
    const list = queue ?? s.queue;
    const track = list[index];
    const pane = paneAfterTrackChange(s.pane, track, s.mediaMode);
    const droppedVideo = s.pane === "video" && pane !== "video";

    set({
      ...(queue ? { queue } : {}),
      currentIndex: index,
      positionMs: 0,
      isPlaying: true,
      pane,
      // Sem vídeo para tocar, o backend volta a ser o de áudio.
      mediaMode: pane === "video" && hasVideo(track) ? "video" : "audio",
    });

    if (droppedVideo) {
      toast.info("Esta música não tem vídeo", "Voltei para a letra.");
    }
  };

  return {
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  shuffle: false,
  repeat: "off",
  layout: "browse",
  positionMs: 0,
  durationMs: 0,
  volume: 1,
  muted: false,
  seekReqMs: null,
  showQueue: true,
  expanded: false,
  pane: "cover",
  mediaMode: "audio",
  mediaSwitching: false,

  setQueue: (tracks, startAt = 0) => moveTo(startAt, tracks),
  // Clicking a row in the queue plays it, rather than only highlighting it.
  jumpTo: (index) => {
    if (index >= 0 && index < get().queue.length) moveTo(index);
  },
  toggleQueue: () => set((s) => ({ showQueue: !s.showQueue })),
  setExpanded: (v) => set({ expanded: v }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set((s) => ({ isPlaying: !s.isPlaying })),
  next: () => {
    const { currentIndex, queue, shuffle } = get();
    const n = pickNext(currentIndex, queue.length, shuffle);
    if (n !== null) moveTo(n);
  },
  prev: () => {
    const { currentIndex, positionMs } = get();
    // restart the track if we're past 3s, else go to previous (common player UX)
    if (positionMs > RESTART_THRESHOLD_MS) return set({ seekReqMs: 0 });
    if (currentIndex > 0) moveTo(currentIndex - 1);
    else set({ seekReqMs: 0 });
  },
  handleEnded: () => {
    const { repeat, currentIndex, queue, shuffle } = get();
    if (repeat === "one") return set({ seekReqMs: 0, isPlaying: true });
    const n = pickNext(currentIndex, queue.length, shuffle);
    if (n !== null) moveTo(n);
    else if (repeat === "all" && queue.length > 0) moveTo(0);
    else set({ isPlaying: false });
  },
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),
  toggleLayout: () => set((s) => ({ layout: s.layout === "album" ? "browse" : "album" })),
  // Chamado a cada quadro: arredonda para inteiro para que quadros que caem no
  // mesmo milissegundo não disparem notificação à toa.
  setPosition: (ms) => set({ positionMs: Math.max(0, Math.round(ms)) }),
  setDurationMs: (ms) => set({ durationMs: Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0 }),
  // Dragging the volume up is also the natural way to unmute.
  setVolume: (v) => set({ volume: v, muted: v === 0 }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  // A posição é atualizada junto com o pedido para a UI não voltar ao ponto
  // antigo por um quadro antes de o backend aplicar o salto.
  requestSeek: (ms) => set({ seekReqMs: Math.max(0, Math.round(ms)), positionMs: Math.max(0, Math.round(ms)) }),
  clearSeek: () => set({ seekReqMs: null }),

  // Abrir a aba Vídeo é o que pede o backend de vídeo; sair dela devolve o
  // áudio. Uma coisa só para a pessoa entender: a aba *é* o modo.
  //
  // Sem vídeo baixado a aba abre assim mesmo — é lá que fica a oferta de baixar
  // — só que o áudio continua tocando, sem troca de backend nenhuma.
  setPane: (pane) => {
    const s = get();
    const playVideo = pane === "video" && hasVideo(s.queue[s.currentIndex]);
    set({ pane, mediaMode: playVideo ? "video" : "audio" });
  },
  setMediaMode: (mediaMode) => set({ mediaMode }),
  setMediaSwitching: (mediaSwitching) => set({ mediaSwitching }),
  };
});

/**
 * Segundo inteiro da posição atual.
 *
 * Existe por causa de desempenho: `positionMs` muda ~60×/s, e um componente que
 * o selecione direto re-renderiza na mesma frequência só para redesenhar um
 * relógio que muda uma vez por segundo. Como o zustand compara a saída do
 * seletor, selecionar o segundo faz o React trabalhar 1×/s em vez de 60×.
 *
 * Quem precisa de fluidez real (a letra, a barra de progresso) deve assinar
 * `positionMs` de forma imperativa — ver `subscribePosition`.
 */
export const selectPositionSec = (s: PlayerState) => Math.floor(s.positionMs / 1000);
export const selectDurationSec = (s: PlayerState) => Math.floor(s.durationMs / 1000);

/**
 * Assinatura imperativa da posição, sem passar por render do React.
 *
 * Uso típico: escrever direto numa CSS custom property ou num `ref` dentro de
 * um `requestAnimationFrame`. Devolve a função de cancelamento.
 */
export function subscribePosition(fn: (positionMs: number) => void): () => void {
  return usePlayerStore.subscribe((state, prev) => {
    if (state.positionMs !== prev.positionMs) fn(state.positionMs);
  });
}
