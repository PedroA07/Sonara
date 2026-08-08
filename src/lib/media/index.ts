import { MediaController } from "./controller";
import { usePlayerStore } from "../../store/usePlayerStore";
import { toast } from "../../store/useToastStore";

export { AudioBackend } from "./AudioBackend";
export { VideoBackend, canPlayH264 } from "./VideoBackend";
export { MediaController } from "./controller";
export type { MediaBackend, MediaMode } from "./MediaBackend";

/**
 * O backend ativo do app inteiro.
 *
 * Singleton de propósito: existe um som tocando, não um por componente. A
 * PlayerBar reconcilia o modo desejado do store com este objeto; a aba Vídeo só
 * pega `media.current.element` para pendurar na tela.
 *
 * Os avisos são ligados aqui — e não dentro do controlador — para o
 * `controller.ts` continuar sem nenhuma dependência de store, que é o que o
 * mantém testável fora do React.
 */
export const media = new MediaController({
  onEnded: () => usePlayerStore.getState().handleEnded(),
  onDurationMs: (ms) => usePlayerStore.getState().setDurationMs(ms),
  onError: (message) => toast.error("Não consegui tocar esta faixa", message),
});
