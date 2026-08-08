import { useEffect, useRef, useState } from "react";
import { usePlayerStore, selectDurationSec, selectPositionSec, hasVideo } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { fileUrl } from "../lib/ipc";
import { media } from "../lib/media";
import { useMiniLyricLine } from "../hooks/useMiniLyricLine";
import { artistOf, fmtClock } from "../lib/format";
import { toast } from "../store/useToastStore";
import CoverArt from "./CoverArt";
import { IconButton } from "./ui";
import {
  IconShuffle, IconPrev, IconNext, IconPlay, IconPause, IconRepeat, IconRepeatOne,
  IconVolume, IconQueue, IconChevronUp, IconGrid, IconList, IconText, IconVideo,
} from "./icons";
import type { Track } from "../types";

// ReplayGain: multiply base volume by the linear track gain (capped at 1 for <audio>).
function effVolume(base: number, track: Track | undefined, replaygain: boolean, muted: boolean): number {
  if (muted) return 0;
  const g = replaygain && track?.gain ? track.gain : 1;
  return Math.max(0, Math.min(1, base * g));
}

export default function PlayerBar() {
  const s = usePlayerStore();
  const { crossfade, replaygain } = useSettingsStore();
  // Relógio: o texto muda 1×/s, então selecionar o segundo evita 60 renders por
  // segundo só para redesenhar "1:24". A barra usa o valor cheio, mas por CSS.
  const positionSec = usePlayerStore(selectPositionSec);
  const durationSec = usePlayerStore(selectDurationSec);
  // Mini-letra: substitui o nome do artista pela linha que está sendo cantada.
  const miniLine = useMiniLyricLine();
  const current = s.queue[s.currentIndex];
  const next = s.queue[s.currentIndex + 1];

  // O laço de animação é montado por estado de reprodução, não por faixa. Estes
  // refs deixam a faixa seguinte e o crossfade visíveis lá dentro sem que uma
  // troca de música derrube e recrie o laço.
  const nextRef = useRef<Track | undefined>(undefined);
  nextRef.current = next;
  const volumeRef = useRef(1);
  volumeRef.current = effVolume(s.volume, next, replaygain, s.muted);

  // `setPosition` é lido do store fora do render: chamá-lo ~60×/s através de
  // uma prop desestruturada faria o laço remontar a cada quadro.
  const setPosition = usePlayerStore((st) => st.setPosition);

  // Janela oculta não precisa de relógio a 60 fps; o áudio segue tocando.
  const [hidden, setHidden] = useState(() =>
    typeof document !== "undefined" && document.hidden
  );
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Um backend existe desde o começo, mesmo sem faixa: assim o primeiro play
  // não precisa esperar a criação do elemento.
  useEffect(() => {
    media.ensure("audio");
    return () => media.destroy();
  }, []);

  // ── troca de faixa ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!current) return;
    const backend = media.current;
    if (!backend) return;
    // Faixa e modo mudaram juntos (o caso "a próxima não tem vídeo"): quem
    // carrega é o efeito de troca, com o arquivo certo. Carregar aqui poria o
    // áudio dentro do backend de vídeo.
    if (backend.mode !== s.mediaMode) return;
    const src = fileUrl(s.mediaMode === "video" && current.video_path
      ? current.video_path
      : current.file_path);

    void backend.load(src, 0).then(() => {
      backend.setVolume(effVolume(s.volume, current, replaygain, s.muted));
      if (s.isPlaying) void backend.play();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Pré-carrega a próxima faixa no slot ocioso (gapless / crossfade). Só faz
  // sentido no áudio: em vídeo não há sobreposição (ADR-02).
  const preloadNext = () => {
    media.audio?.preloadNext(nextRef.current ? fileUrl(nextRef.current.file_path) : null);
  };
  useEffect(() => {
    preloadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.id, s.mediaMode]);

  // ── troca de backend (áudio ↔ vídeo) ──────────────────────────────────────
  useEffect(() => {
    const backend = media.current;
    if (!backend || !current) return;
    if (backend.mode === s.mediaMode) return;

    const wantVideo = s.mediaMode === "video";
    const src = wantVideo ? current.video_path : current.file_path;
    if (wantVideo && !src) {
      usePlayerStore.getState().setMediaMode("audio");
      return;
    }

    let alive = true;
    usePlayerStore.getState().setMediaSwitching(true);
    void media
      .switchTo(s.mediaMode, {
        src: fileUrl(src!),
        positionMs: usePlayerStore.getState().positionMs,
        wasPlaying: usePlayerStore.getState().isPlaying,
        offsetMs: wantVideo ? current.video_offset_ms : 0,
        volume: effVolume(s.volume, current, replaygain, s.muted),
      })
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          usePlayerStore.setState({ positionMs: res.positionMs });
          // O backend é novo em folha: a pré-carga da próxima faixa foi embora
          // junto com o antigo, e sem isto o primeiro crossfade após voltar do
          // vídeo não teria de onde puxar o som.
          preloadNext();
        } else {
          // O áudio nunca foi interrompido de verdade — só o vídeo falhou.
          usePlayerStore.setState({ mediaMode: "audio", pane: "cover" });
          toast.error("Não consegui abrir o vídeo", res.error);
        }
      })
      .finally(() => {
        if (alive) usePlayerStore.getState().setMediaSwitching(false);
      });

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.mediaMode, current?.id]);

  // Play / pause.
  useEffect(() => {
    if (s.isPlaying) void media.current?.play();
    else media.current?.pause();
  }, [s.isPlaying]);

  // Volume / mute / ReplayGain.
  useEffect(() => {
    media.current?.setVolume(effVolume(s.volume, current, replaygain, s.muted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.volume, s.muted, replaygain, current?.id]);

  // Honour seek requests.
  useEffect(() => {
    if (s.seekReqMs === null) return;
    media.current?.seek(s.seekReqMs);
    if (s.isPlaying) void media.current?.play();
    s.clearSeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.seekReqMs]);

  // ADR-01: o relógio é lido do backend ativo a cada quadro e publicado no
  // store. `onTimeUpdate` dispara ~4×/s em cadência irregular — suficiente para
  // um relógio, insuficiente para a letra acompanhar sem tremer.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const backend = media.current;
      if (backend) {
        setPosition(backend.currentMs());
        const audio = media.audio;
        if (crossfade > 0 && nextRef.current && audio && !audio.isCrossfading()
            && audio.remainingSec() <= crossfade) {
          audio.startCrossfade(crossfade, volumeRef.current, () =>
            usePlayerStore.getState().next()
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    // Parado ou com a janela oculta não há o que animar: o laço é suspenso para
    // não gastar bateria à toa.
    if (s.isPlaying && !hidden) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.isPlaying, hidden, crossfade]);

  const pct = s.durationMs > 0 ? (s.positionMs / s.durationMs) * 100 : 0;
  const volPct = (s.muted ? 0 : s.volume) * 100;
  const hasTrack = !!current;

  return (
    <footer className="h-[84px] shrink-0 bg-panel border-t divider flex items-center px-5 gap-5 relative z-20">
      {/* ── Now playing ───────────────────────────────────────────── */}
      <div className="w-[260px] min-w-0 flex items-center gap-3">
        <button
          title={hasTrack ? "Abrir tela cheia (F)" : undefined}
          onClick={() => hasTrack && s.setExpanded(true)}
          disabled={!hasTrack}
          className="group relative w-14 h-14 shrink-0 rounded-xl overflow-hidden shadow-soft disabled:cursor-default"
        >
          <CoverArt path={current?.cover_path} />
          {hasTrack && (
            <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <IconChevronUp size={18} />
            </span>
          )}
        </button>
        <div
          className={`min-w-0 ${hasTrack ? "cursor-pointer" : ""}`}
          onClick={() => hasTrack && s.setExpanded(true)}
        >
          <div className="truncate text-sm font-medium text-content">
            {current?.title ?? "Nada tocando"}
          </div>
          <div className="truncate text-xs text-muted mt-0.5">
            {miniLine || (current ? artistOf(current) : "Escolha uma música na biblioteca")}
          </div>
        </div>
      </div>

      {/* ── Transport ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <IconButton label="Aleatório (S)" active={s.shuffle} onClick={s.toggleShuffle}>
            <IconShuffle size={17} />
          </IconButton>
          <IconButton label="Faixa anterior (Shift + ←)" onClick={s.prev} disabled={!hasTrack}>
            <IconPrev size={22} />
          </IconButton>
          <button
            title="Tocar / pausar (Espaço)"
            aria-label={s.isPlaying ? "Pausar" : "Tocar"}
            onClick={s.toggle}
            disabled={!hasTrack}
            className="w-11 h-11 rounded-full brand-gradient text-white flex items-center justify-center
              shadow-glow transition-transform duration-150 ease-pop hover:scale-105 active:scale-95
              disabled:opacity-40 disabled:hover:scale-100"
          >
            {s.isPlaying ? <IconPause size={18} /> : <IconPlay size={18} className="ml-0.5" />}
          </button>
          <IconButton label="Próxima faixa (Shift + →)" onClick={s.next} disabled={!hasTrack}>
            <IconNext size={22} />
          </IconButton>
          <IconButton
            label={s.repeat === "one" ? "Repetir uma (R)" : s.repeat === "all" ? "Repetir tudo (R)" : "Repetir (R)"}
            active={s.repeat !== "off"}
            onClick={s.cycleRepeat}
          >
            {s.repeat === "one" ? <IconRepeatOne size={17} /> : <IconRepeat size={17} />}
          </IconButton>
        </div>

        <div className="w-full max-w-xl flex items-center gap-2.5 text-[11px] text-muted tabular-nums">
          <span className="w-9 text-right">{fmtClock(positionSec)}</span>
          <input
            type="range" min={0} max={s.durationMs || 0} step={100} value={s.positionMs}
            onChange={(e) => s.requestSeek(Number(e.target.value))}
            disabled={!hasTrack}
            aria-label="Posição na música"
            className="flex-1 track-range"
            style={{ ["--pct" as string]: `${pct}%` }}
          />
          <span className="w-9">{fmtClock(durationSec)}</span>
        </div>
      </div>

      {/* ── Right-hand controls ───────────────────────────────────── */}
      <div className="w-[260px] flex items-center justify-end gap-1">
        <IconButton
          label="Ver a letra (L)"
          active={s.expanded && s.pane === "lyrics"}
          disabled={!hasTrack}
          onClick={() => { s.setPane("lyrics"); s.setExpanded(true); }}
        >
          <IconText size={17} />
        </IconButton>
        {hasVideo(current) && (
          <IconButton
            label="Ver o vídeo"
            active={s.expanded && s.pane === "video"}
            onClick={() => { s.setPane("video"); s.setExpanded(true); }}
          >
            <IconVideo size={17} />
          </IconButton>
        )}
        <IconButton
          label={s.layout === "album" ? "Ver a fila como lista" : "Ver a fila com capas"}
          onClick={s.toggleLayout}
        >
          {s.layout === "album" ? <IconList size={17} /> : <IconGrid size={17} />}
        </IconButton>
        <IconButton label="Mostrar/ocultar a fila (Q)" active={s.showQueue} onClick={s.toggleQueue}>
          <IconQueue size={17} />
        </IconButton>
        <IconButton label={s.muted ? "Reativar som (M)" : "Mudo (M)"} active={s.muted} onClick={s.toggleMute}>
          <IconVolume size={17} />
        </IconButton>
        <input
          type="range" min={0} max={1} step={0.01} value={s.muted ? 0 : s.volume}
          onChange={(e) => s.setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="w-24 track-range"
          style={{ ["--pct" as string]: `${volPct}%` }}
        />
      </div>
    </footer>
  );
}
