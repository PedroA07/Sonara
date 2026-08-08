/**
 * ADR-02 — abstração de backend de mídia.
 *
 * Existe **um** backend por vez. O outro não é silenciado: é destruído. Dois
 * elementos decodificando a mesma música ao mesmo tempo gastam CPU à toa e,
 * pior, saem de sincronia — na volta para o áudio a posição seria a do elemento
 * errado.
 *
 * A exclusividade vale entre **backends**, não entre elementos: o `AudioBackend`
 * mantém dois `<audio>` internamente para fazer o crossfade, e isso é detalhe
 * dele. Trocar isso por um elemento só apagaria um recurso que já existe e
 * funciona.
 *
 * O relógio continua sendo o do ADR-01 (`positionMs` no store); o backend só
 * responde `currentMs()` quando perguntado, a cada quadro.
 */

export type MediaMode = "audio" | "video";

/** Avisos que o backend manda de volta para quem o criou. */
export interface MediaHooks {
  /** A faixa acabou sozinha (não vale para o fim causado por um crossfade). */
  onEnded?: () => void;
  /** Duração conhecida, em ms — chega quando os metadados carregam. */
  onDurationMs?: (ms: number) => void;
  /** Falha de carregamento/decodificação, já em texto legível. */
  onError?: (message: string) => void;
}

export interface MediaBackend {
  readonly mode: MediaMode;
  /**
   * Elemento que está tocando agora. O vídeo precisa dele para aparecer na
   * tela; o áudio o expõe só para os testes e para o `canplay`.
   */
  readonly element: HTMLMediaElement;
  /** Aponta o backend para um arquivo e posiciona em `atMs`. */
  load(src: string, atMs?: number): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(ms: number): void;
  currentMs(): number;
  durationMs(): number;
  /** Volume final, já com ReplayGain e mudo aplicados (0–1). */
  setVolume(v: number): void;
  destroy(): void;
}

/**
 * Fábrica de elementos, injetável.
 *
 * Os testes de troca de backend rodam em ambiente Node, onde
 * `document.createElement` não existe e um `<video>` real nunca dispararia
 * `canplay`. Passando a fábrica, o mesmo código de produção roda contra
 * elementos falsos.
 */
export type ElementFactory = (tag: MediaMode) => HTMLMediaElement;

export const domElementFactory: ElementFactory = (tag) =>
  document.createElement(tag) as HTMLMediaElement;

/** Quanto tempo esperar o `canplay` antes de desistir da troca (§6.2). */
export const CANPLAY_TIMEOUT_MS = 4_000;

/**
 * Resolve quando o elemento tem dados suficientes para tocar, ou rejeita.
 *
 * `HAVE_FUTURE_DATA` (3) já basta: esperar `canplaythrough` significaria
 * segurar a troca até o arquivo inteiro estar em buffer, o que num vídeo de
 * 300 MB é a diferença entre 200 ms e meio minuto.
 */
export function waitCanPlay(
  el: HTMLMediaElement,
  timeoutMs: number = CANPLAY_TIMEOUT_MS
): Promise<void> {
  // Um erro que já aconteceu não vai disparar o evento de novo: sem esta
  // checagem, um arquivo que o sistema não decodifica só falharia depois de
  // esperar os 4 s inteiros, e a pessoa veria "carregando" por nada.
  if (el.error) return Promise.reject(new Error(mediaErrorMessage(el)));
  if (el.readyState >= 3) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener("canplay", ok);
      el.removeEventListener("error", fail);
      err ? reject(err) : resolve();
    };
    const ok = () => finish();
    const fail = () => finish(new Error(mediaErrorMessage(el)));
    const timer = setTimeout(
      () => finish(new Error("O vídeo demorou demais para abrir.")),
      timeoutMs
    );

    el.addEventListener("canplay", ok);
    el.addEventListener("error", fail);
  });
}

/**
 * Traduz o `MediaError` do elemento para algo acionável.
 *
 * `MEDIA_ERR_SRC_NOT_SUPPORTED` é o caso comum e o mais confuso: o arquivo
 * existe e está inteiro, mas o webview não tem o codec. Dizer "não suportado"
 * mandaria a pessoa procurar defeito no arquivo.
 */
export function mediaErrorMessage(el: HTMLMediaElement): string {
  switch (el.error?.code) {
    case 1: return "A abertura do arquivo foi interrompida.";
    case 2: return "Falha ao ler o arquivo do disco.";
    case 3: return "O arquivo está corrompido ou foi cortado no meio.";
    case 4: return "Este sistema não consegue decodificar o vídeo (falta o codec H.264).";
    default: return "Não foi possível abrir a mídia.";
  }
}

/**
 * `requestAnimationFrame` com queda para `setTimeout`.
 *
 * Os backends rodam sob teste em ambiente Node, onde `requestAnimationFrame`
 * não existe. Sem isto, `destroy()` — que precisa ser a operação mais confiável
 * da classe — lançaria exceção justamente na hora de encerrar tudo.
 */
export function onNextFrame(fn: (t: number) => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(fn);
  return setTimeout(() => fn(performance.now()), 16) as unknown as number;
}

export function cancelFrame(id: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

/** ms → segundos para a API do elemento, que trabalha em segundos. */
export function toSeconds(ms: number): number {
  return Math.max(0, ms) / 1000;
}

/** `duration` do elemento em ms, ou 0 enquanto os metadados não chegaram. */
export function elementDurationMs(el: HTMLMediaElement): number {
  return Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 1000) : 0;
}
