import { usePlayerStore } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";
import CoverArt from "./CoverArt";
import {
  IconShuffle, IconPrev, IconNext, IconPlay, IconPause, IconRepeat, IconRepeatOne, IconVolume, IconChevronDown,
} from "./icons";

function fmt(sec: number): string {
  if (!isFinite(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// RF-06: full-screen "now playing" view. Purely reflects/controls the shared
// player store — the actual <audio> lives in PlayerBar, which stays mounted.
export default function NowPlaying() {
  const s = usePlayerStore();
  const { replaygain } = useSettingsStore();
  const current = s.queue[s.currentIndex];

  return (
    <div className="fixed inset-0 z-40 bg-ink flex flex-col">
      <div className="flex items-center px-6 py-4">
        <button title="Recolher" onClick={() => s.setExpanded(false)} className="text-muted hover:text-content">
          <IconChevronDown size={26} />
        </button>
        <span className="ml-3 text-sm text-muted">Tocando agora{replaygain && current?.gain ? " · ReplayGain" : ""}</span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 gap-8">
        <div className="w-[min(46vh,380px)] aspect-square rounded-3xl overflow-hidden shadow-2xl">
          <CoverArt path={current?.cover_path} size="lg" />
        </div>
        <div className="text-center max-w-lg">
          <div className="text-3xl font-bold truncate">{current?.title ?? "Nada tocando"}</div>
          <div className="text-muted mt-1">{current?.format?.toUpperCase() ?? ""}</div>
        </div>

        <div className="w-full max-w-xl flex items-center gap-3 text-xs text-muted">
          <span>{fmt(s.currentTime)}</span>
          <input type="range" min={0} max={s.duration || 0} step={0.1} value={s.currentTime}
            onChange={(e) => s.requestSeek(Number(e.target.value))} className="flex-1 accent-brand h-1" />
          <span>{fmt(s.duration)}</span>
        </div>

        <div className="flex items-center gap-8 text-2xl">
          <button title="Aleatório (S)" onClick={s.toggleShuffle} className={s.shuffle ? "text-brand" : "text-muted hover:text-content"}><IconShuffle size={22} /></button>
          <button title="Anterior" onClick={s.prev} className="text-muted hover:text-content"><IconPrev size={30} /></button>
          <button title="Play/Pause (Espaço)" onClick={s.toggle} className="w-16 h-16 rounded-full bg-content text-ink flex items-center justify-center hover:scale-105 transition">
            {s.isPlaying ? <IconPause size={26} /> : <IconPlay size={26} />}
          </button>
          <button title="Próxima (Shift+→)" onClick={s.next} className="text-muted hover:text-content"><IconNext size={30} /></button>
          <button title="Repetir (R)" onClick={s.cycleRepeat} className={s.repeat !== "off" ? "text-brand" : "text-muted hover:text-content"}>
            {s.repeat === "one" ? <IconRepeatOne size={22} /> : <IconRepeat size={22} />}
          </button>
        </div>

        <div className="w-full max-w-xs flex items-center gap-3 text-muted">
          <IconVolume size={18} />
          <input type="range" min={0} max={1} step={0.01} value={s.volume}
            onChange={(e) => s.setVolume(Number(e.target.value))} className="flex-1 accent-brand h-1" />
        </div>
      </div>
    </div>
  );
}
