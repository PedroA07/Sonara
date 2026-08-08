import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Track, VideoProbe } from "../../types";
import { api } from "../../lib/ipc";
import { media } from "../../lib/media";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useLyricsStore } from "../../store/useLyricsStore";
import { fmtBytes } from "../../lib/format";
import { toast } from "../../store/useToastStore";
import CoverArt from "../CoverArt";
import VideoLyricsOverlay from "./VideoLyricsOverlay";
import { Button, Spinner } from "../ui";
import {
  IconAlert, IconDownload, IconExitFullscreen, IconFullscreen, IconPip, IconStop, IconText,
} from "../icons";

/**
 * Aba Vídeo do "Tocando agora".
 *
 * O elemento `<video>` não é renderizado aqui: ele pertence ao `VideoBackend`
 * (ADR-02) e é apenas *pendurado* neste contêiner. É o que permite trocar de
 * aba sem destruir o vídeo, e destruir o vídeo sem depender do React desmontar
 * na hora certa.
 */
export default function VideoPane({ track }: { track: Track | undefined }) {
  const mount = useRef<HTMLDivElement | null>(null);
  const shell = useRef<HTMLDivElement | null>(null);
  const switching = usePlayerStore((s) => s.mediaSwitching);
  const [fullscreen, setFullscreen] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);
  const lyrics = useLyricsStore((s) => s.lyrics);

  // Pendura (e despendura) o elemento do backend ativo.
  useEffect(() => {
    const host = mount.current;
    const el = media.current?.mode === "video" ? media.current.element : null;
    if (!host || !el) return;
    el.className = "w-full h-full object-contain bg-black";
    host.appendChild(el);
    return () => { if (el.parentElement === host) host.removeChild(el); };
  }, [track?.id, switching]);

  // Tela cheia de verdade (F), e a saída pelo Esc do próprio sistema.
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    const box = shell.current;
    if (!box) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void box.requestFullscreen?.().catch(() => {});
  };

  const nudgeOffset = async (delta: number) => {
    if (!track) return;
    try {
      const value = await api.setVideoOffset(track.id, (track.video_offset_ms ?? 0) + delta);
      // A fila guarda a faixa: sem atualizar aqui, o próximo ajuste partiria do
      // valor antigo e o acerto ficaria sempre um passo atrás.
      usePlayerStore.setState((s) => ({
        queue: s.queue.map((t) => (t.id === track.id ? { ...t, video_offset_ms: value } : t)),
      }));
      media.current?.seek(usePlayerStore.getState().positionMs + delta);
      toast.info("Sincronia do vídeo", `${value > 0 ? "+" : ""}${value} ms`);
    } catch (e) {
      toast.error("Não foi possível ajustar", String(e));
    }
  };

  // F e [ / ] são desta aba enquanto ela está aberta (ver useKeyboardShortcuts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
      else if (e.key === "[") void nudgeOffset(e.shiftKey ? -500 : -100);
      else if (e.key === "]") void nudgeOffset(e.shiftKey ? 500 : 100);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const togglePip = async () => {
    const el = media.current?.element as HTMLVideoElement | undefined;
    if (!el?.requestPictureInPicture) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await el.requestPictureInPicture();
    } catch (e) {
      toast.error("Picture-in-picture indisponível", String(e));
    }
  };

  const pipSupported =
    typeof document !== "undefined" && (document as Document).pictureInPictureEnabled === true;

  if (!track) return null;

  return (
    <div ref={shell} className="relative z-10 flex-1 min-h-0 flex flex-col bg-black/40">
      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <div ref={mount} className="w-full h-full max-h-full aspect-video mx-auto" />

        {switching && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80 bg-black/60">
            <Spinner /> Abrindo o vídeo…
          </div>
        )}

        {showLyrics && lyrics && !switching && <VideoLyricsOverlay />}
      </div>

      <div className="flex items-center justify-center gap-1.5 px-6 py-3">
        <Button
          size="sm"
          variant={showLyrics ? "primary" : "ghost"}
          onClick={() => setShowLyrics((v) => !v)}
          disabled={!lyrics}
          title={lyrics ? undefined : "Esta música ainda não tem letra carregada"}
        >
          <IconText size={14} /> Letra sobre o vídeo
        </Button>
        <Button size="sm" variant="ghost" onClick={toggleFullscreen}>
          {fullscreen ? <IconExitFullscreen size={15} /> : <IconFullscreen size={15} />}
          {fullscreen ? "Sair da tela cheia" : "Tela cheia (F)"}
        </Button>
        {pipSupported && (
          <Button size="sm" variant="ghost" onClick={togglePip}>
            <IconPip size={15} /> Janela flutuante
          </Button>
        )}
        <span className="text-[11px] text-muted ml-2 tabular-nums">
          Sincronia: {track.video_offset_ms > 0 ? "+" : ""}{track.video_offset_ms} ms
          <span className="text-muted/70"> · [ e ] ajustam</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Este sistema não decodifica H.264.
 *
 * Acontece no Linux, quando a distribuição não traz os plugins do GStreamer.
 * Esconder a aba sem dizer nada faria a pessoa achar que o Sonara não tem o
 * recurso; aqui ela vê o que instalar e, se já baixou o vídeo, ainda consegue
 * assistir no player do sistema.
 */
export function VideoUnsupported({ track }: { track: Track }) {
  return (
    <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <IconAlert size={26} className="text-warn mx-auto" />
        <h2 className="text-xl font-semibold">Este sistema não abre vídeo aqui dentro</h2>
        <p className="text-sm text-muted leading-relaxed">
          Falta o codec H.264 no seu sistema. No Linux, ele costuma vir nos plugins do GStreamer:
        </p>
        <code className="block text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-left">
          sudo apt install gstreamer1.0-libav gstreamer1.0-plugins-good
        </code>
        {track.video_path && (
          <Button
            onClick={() =>
              api.openPath(track.video_path!).catch((e) =>
                toast.error("Não foi possível abrir", String(e))
              )
            }
          >
            Abrir no player do sistema
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Tela de "esta música ainda não tem vídeo".
 *
 * Mostra o tamanho **antes** de baixar: aceitar um download sem saber se são
 * 40 MB ou 600 é o tipo de surpresa que faz a pessoa desconfiar do app.
 */
export function VideoOffer({
  track, onDone,
}: {
  track: Track;
  /** Chamado com o caminho do arquivo pronto. */
  onDone: (path: string) => void;
}) {
  const [probe, setProbe] = useState<VideoProbe | null>(null);
  const [probing, setProbing] = useState(true);
  const [err, setErr] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let alive = true;
    setProbing(true); setErr(""); setProbe(null);
    api.videoProbe(track.id)
      .then((p) => { if (alive) setProbe(p); })
      .catch((e) => { if (alive) setErr(String(e)); })
      .finally(() => { if (alive) setProbing(false); });
    return () => { alive = false; };
  }, [track.id]);

  // O progresso chega pelo mesmo canal do download de áudio.
  useEffect(() => {
    let un: (() => void) | undefined;
    listen<{ trackId: number; status: string; progress: number; message: string; path: string | null }>(
      "video-progress",
      (e) => {
        if (e.payload.trackId !== track.id) return;
        setPct(e.payload.progress);
        if (e.payload.status === "done") onDone(e.payload.path ?? "");
        else if (e.payload.status === "error") { setErr(e.payload.message); setJobId(null); }
        else if (e.payload.status === "canceled") { setJobId(null); setPct(0); }
      }
    )
      .then((f) => { un = f; })
      .catch(() => {});
    return () => { un?.(); };
  }, [track.id, onDone]);

  const start = async () => {
    setErr("");
    try {
      setJobId(await api.downloadVideo(track.id));
    } catch (e) {
      setErr(String(e));
    }
  };

  const cancel = () => {
    if (jobId !== null) api.cancelDownload(jobId).catch(() => {});
  };

  const size = probe?.sizeBytes ? `~${fmtBytes(probe.sizeBytes)}` : "tamanho desconhecido";

  return (
    <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center px-6">
      {/* A capa desfocada ocupa o lugar do vídeo que ainda não existe. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 scale-125 blur-3xl opacity-25">
          <CoverArt path={track.cover_path} size="lg" className="!rounded-none" />
        </div>
      </div>

      <div className="relative max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold">Assistir ao vídeo desta música</h2>

        {probing ? (
          <p className="text-sm text-muted flex items-center justify-center gap-2">
            <Spinner /> Consultando o tamanho…
          </p>
        ) : err ? (
          <p className="text-sm text-danger flex items-start gap-2 text-left">
            <IconAlert size={15} className="mt-0.5 shrink-0" /> {err}
          </p>
        ) : (
          <p className="text-sm text-muted leading-relaxed">
            {probe?.title ? <><span className="text-content">{probe.title}</span><br /></> : null}
            {probe?.quality ?? "720p"} · {size}. O vídeo é um arquivo à parte —
            a música que você já baixou continua intacta.
          </p>
        )}

        {jobId !== null ? (
          <div className="space-y-2">
            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full brand-gradient transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted tabular-nums">{Math.round(pct)}%</p>
            <Button size="sm" variant="ghost" onClick={cancel}><IconStop size={13} /> Cancelar</Button>
          </div>
        ) : (
          <Button variant="primary" onClick={start} disabled={probing}>
            <IconDownload size={15} /> Baixar vídeo {probe?.sizeBytes ? `(${size})` : ""}
          </Button>
        )}
      </div>
    </div>
  );
}
