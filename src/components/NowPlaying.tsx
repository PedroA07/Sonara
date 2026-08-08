import { useEffect, useState } from "react";
import type { Track } from "../types";
import { usePlayerStore, selectDurationSec, selectPositionSec } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { artistOf, fmtClock } from "../lib/format";
import CoverArt from "./CoverArt";
import { Badge, IconButton, Segmented } from "./ui";
import LyricsPane from "./lyrics/LyricsPane";
import LyricsEditor from "./lyrics/LyricsEditor";
import LyricsSearchModal from "./lyrics/LyricsSearchModal";
import { useLyricsStore } from "../store/useLyricsStore";
import {
  IconShuffle, IconPrev, IconNext, IconPlay, IconPause, IconRepeat, IconRepeatOne,
  IconVolume, IconChevronDown, IconMusic, IconText,
} from "./icons";

/** Full-screen "now playing". Purely reflects/controls the shared player store —
 *  the actual <audio> lives in PlayerBar, which stays mounted. */
export default function NowPlaying() {
  const s = usePlayerStore();
  const { replaygain } = useSettingsStore();
  const current = s.queue[s.currentIndex];
  const prev = s.queue[s.currentIndex - 1];
  const next = s.queue[s.currentIndex + 1];
  // Mesmo motivo da PlayerBar: o texto do relógio muda 1×/s, então selecionar o
  // segundo evita re-render a cada quadro.
  const positionSec = usePlayerStore(selectPositionSec);
  const durationSec = usePlayerStore(selectDurationSec);
  const pct = s.durationMs > 0 ? (s.positionMs / s.durationMs) * 100 : 0;

  // Aba ativa do painel. "Vídeo" entra no PR do modo vídeo.
  const [pane, setPane] = useState<"cover" | "lyrics">("cover");
  const [editing, setEditing] = useState(false);
  const [searching, setSearching] = useState(false);
  const loadLyrics = useLyricsStore((st) => st.load);
  const clearLyrics = useLyricsStore((st) => st.clear);
  const lyricsProviderOn = useSettingsStore((st) => st.lyricsProviderEnabled);

  // A letra só é buscada quando a aba está aberta: numa biblioteca grande, o
  // custo de resolver a letra de toda faixa que toca não se justifica.
  useEffect(() => {
    if (pane !== "lyrics") return;
    if (!current) { clearLyrics(); return; }
    loadLyrics(current.id, lyricsProviderOn);
  }, [pane, current?.id, lyricsProviderOn, loadLyrics, clearLyrics]);

  return (
    <div className="fixed inset-0 z-40 bg-ink flex flex-col animate-fade-in">
      {/* A blurred blow-up of the cover as the backdrop — the art sets the mood. */}
      {current?.cover_path && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0 scale-125 blur-3xl opacity-30">
            <CoverArt path={current.cover_path} size="lg" className="!rounded-none" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/85 to-ink" />
        </div>
      )}

      <div className="relative z-10 flex items-center gap-3 px-6 py-4">
        <IconButton label="Recolher (F ou Esc)" onClick={() => s.setExpanded(false)}>
          <IconChevronDown size={24} />
        </IconButton>
        <span className="text-xs uppercase tracking-[0.14em] text-muted">Tocando agora</span>
        {replaygain && current?.gain ? <Badge tone="brand">ReplayGain</Badge> : null}
        <div className="ml-auto">
          <Segmented
            value={pane}
            onChange={setPane}
            size="sm"
            options={[
              { value: "cover", label: "Capa", icon: <IconMusic size={13} /> },
              { value: "lyrics", label: "Letra", icon: <IconText size={13} /> },
            ]}
          />
        </div>
      </div>

      {pane === "lyrics" ? (
        <div className="relative z-10 flex-1 min-h-0 flex flex-col">
          <LyricsPane
            onEdit={() => setEditing(true)}
            onSearch={() => setSearching(true)}
            onOpenSettings={() => s.setExpanded(false)}
          />
        </div>
      ) : (
      <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center gap-8 px-6">
        {/* Side previews: what just played and what comes next. Hidden on
            narrow windows, where the "A seguir" line at the bottom stands in. */}
        <SidePreview track={prev} label="Anterior" side="left" onPlay={() => s.jumpTo(s.currentIndex - 1)} />

        <div className="flex flex-col items-center justify-center gap-7 min-w-0">
        <div className="w-[min(42vh,360px)] aspect-square rounded-3xl overflow-hidden shadow-lift">
          <CoverArt path={current?.cover_path} size="lg" />
        </div>

        <div className="text-center max-w-xl px-4">
          <h1 className="text-3xl font-bold truncate">{current?.title ?? "Nada tocando"}</h1>
          <p className="text-muted mt-1.5 truncate">
            {current ? artistOf(current) : "Escolha uma música na biblioteca"}
            {current?.album_title ? ` · ${current.album_title}` : ""}
          </p>
        </div>

        <div className="w-full max-w-xl flex items-center gap-3 text-xs text-muted tabular-nums">
          <span className="w-10 text-right">{fmtClock(positionSec)}</span>
          <input
            type="range" min={0} max={s.durationMs || 0} step={100} value={s.positionMs}
            onChange={(e) => s.requestSeek(Number(e.target.value))}
            aria-label="Posição na música"
            className="flex-1 track-range"
            style={{ ["--pct" as string]: `${pct}%` }}
          />
          <span className="w-10">{fmtClock(durationSec)}</span>
        </div>

        <div className="flex items-center gap-6">
          <IconButton label="Aleatório (S)" active={s.shuffle} onClick={s.toggleShuffle}>
            <IconShuffle size={20} />
          </IconButton>
          <IconButton label="Faixa anterior" onClick={s.prev} className="w-12 h-12">
            <IconPrev size={30} />
          </IconButton>
          <button
            title="Tocar / pausar (Espaço)"
            aria-label={s.isPlaying ? "Pausar" : "Tocar"}
            onClick={s.toggle}
            className="w-16 h-16 rounded-full brand-gradient text-white flex items-center justify-center
              shadow-glow transition-transform duration-150 ease-pop hover:scale-105 active:scale-95"
          >
            {s.isPlaying ? <IconPause size={26} /> : <IconPlay size={26} className="ml-1" />}
          </button>
          <IconButton label="Próxima faixa" onClick={s.next} className="w-12 h-12">
            <IconNext size={30} />
          </IconButton>
          <IconButton label="Repetir (R)" active={s.repeat !== "off"} onClick={s.cycleRepeat}>
            {s.repeat === "one" ? <IconRepeatOne size={20} /> : <IconRepeat size={20} />}
          </IconButton>
        </div>

        <div className="w-full max-w-xs flex items-center gap-3 text-muted">
          <IconButton label={s.muted ? "Reativar som (M)" : "Mudo (M)"} active={s.muted} onClick={s.toggleMute}>
            <IconVolume size={18} />
          </IconButton>
          <input
            type="range" min={0} max={1} step={0.01} value={s.muted ? 0 : s.volume}
            onChange={(e) => s.setVolume(Number(e.target.value))}
            aria-label="Volume"
            className="flex-1 track-range"
            style={{ ["--pct" as string]: `${(s.muted ? 0 : s.volume) * 100}%` }}
          />
        </div>
        </div>

        <SidePreview track={next} label="A seguir" side="right" onPlay={() => s.jumpTo(s.currentIndex + 1)} />
      </div>
      )}

      {editing && <LyricsEditor onClose={() => setEditing(false)} />}
      {searching && current && (
        <LyricsSearchModal
          trackId={current.id}
          initialQuery={[artistOf(current), current.title].filter(Boolean).join(" ")}
          onClose={() => setSearching(false)}
        />
      )}

      {next && pane === "cover" && (
        <div className="relative z-10 px-6 py-4 text-center text-xs text-muted xl:hidden">
          A seguir: <span className="text-content/85">{next.title}</span> · {artistOf(next)}
        </div>
      )}
    </div>
  );
}

/** A peek at the track before/after the current one. Clicking it jumps there.
 *  Renders an empty placeholder (not nothing) so the centre column doesn't
 *  shift sideways when one of the two sides is missing. */
function SidePreview({
  track, label, side, onPlay,
}: {
  track?: Track;
  label: string;
  side: "left" | "right";
  onPlay: () => void;
}) {
  if (!track) return <div className="hidden xl:block w-[190px] shrink-0" aria-hidden="true" />;

  return (
    <button
      onClick={onPlay}
      title={`Tocar "${track.title}"`}
      className={`hidden xl:flex w-[190px] shrink-0 flex-col gap-3 rounded-2xl p-3 text-left
        opacity-55 hover:opacity-100 transition-opacity focus-visible:opacity-100
        ${side === "left" ? "items-start" : "items-end text-right"}`}
    >
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="w-full aspect-square rounded-xl overflow-hidden shadow-soft">
        <CoverArt path={track.cover_path} />
      </span>
      <span className="w-full min-w-0">
        <span className="block text-sm text-content truncate">{track.title}</span>
        <span className="block text-xs text-muted truncate">{artistOf(track)}</span>
      </span>
    </button>
  );
}
