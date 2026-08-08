import {
  domElementFactory, elementDurationMs, mediaErrorMessage, toSeconds,
  type ElementFactory, type MediaBackend, type MediaHooks,
} from "./MediaBackend";

/**
 * Backend de vídeo — um `<video>`, sem crossfade.
 *
 * Crossfade e gapless **não se aplicam** aqui e são desligados de propósito:
 * sobrepor duas faixas exigiria dois vídeos decodificando ao mesmo tempo, e a
 * imagem não tem como se "misturar" do jeito que o som tem. Ao fim da faixa o
 * modo vídeo simplesmente avança.
 *
 * O elemento é criado pelo backend, mas quem o mostra é a aba Vídeo, que o
 * anexa ao próprio contêiner. Assim o `destroy()` continua sendo a única coisa
 * que encerra o decode, mesmo que o React desmonte a aba antes.
 */
export class VideoBackend implements MediaBackend {
  readonly mode = "video" as const;
  readonly element: HTMLVideoElement;
  private hooks: MediaHooks;
  private destroyed = false;

  constructor(hooks: MediaHooks = {}, factory: ElementFactory = domElementFactory) {
    this.hooks = hooks;
    this.element = factory("video") as HTMLVideoElement;
    this.element.preload = "auto";
    // Controles do próprio Sonara; os nativos brigariam com a barra do player.
    this.element.controls = false;
    this.element.playsInline = true;
    this.element.addEventListener("loadedmetadata", () =>
      this.hooks.onDurationMs?.(elementDurationMs(this.element))
    );
    this.element.addEventListener("ended", () => this.hooks.onEnded?.());
    this.element.addEventListener("error", () => {
      if (!this.destroyed) this.hooks.onError?.(mediaErrorMessage(this.element));
    });
  }

  async load(src: string, atMs = 0): Promise<void> {
    if (this.element.src !== src) {
      this.element.src = src;
      this.element.load();
    }
    if (atMs > 0) this.seek(atMs);
  }

  async play(): Promise<void> {
    try {
      await this.element.play();
    } catch {
      /* idem AudioBackend: o próximo clique resolve */
    }
  }

  pause(): void {
    this.element.pause();
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
    // ReplayGain continua valendo: o ganho já vem multiplicado de fora, igual
    // ao áudio. Trocar de modo não pode mudar o volume percebido.
    this.element.volume = v;
  }

  destroy(): void {
    this.destroyed = true;
    this.element.pause();
    this.element.removeAttribute("src");
    this.element.load();
    this.element.remove();
  }
}

/**
 * O webview desta máquina consegue tocar H.264 + AAC em MP4?
 *
 * No Windows e no macOS a resposta é sempre sim. No Linux o WebKitGTK depende
 * dos plugins do GStreamer, e distribuição sem `gstreamer1.0-libav` instalado
 * simplesmente não decodifica H.264 — a aba Vídeo precisa sumir em vez de
 * mostrar um retângulo preto.
 */
export function canPlayH264(el?: HTMLVideoElement): boolean {
  const probe = el ?? (typeof document !== "undefined" ? document.createElement("video") : null);
  if (!probe || typeof probe.canPlayType !== "function") return false;
  const verdict = probe.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
  // "maybe" conta: o padrão manda o navegador responder assim quando só saberá
  // ao abrir o arquivo, e é o que o WebKit responde mesmo tendo o codec.
  return verdict === "probably" || verdict === "maybe";
}
