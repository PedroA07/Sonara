import { useEffect, useRef, type SyntheticEvent } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { fileUrl } from "../lib/ipc";
import CoverArt from "./CoverArt";
import {
  IconShuffle, IconPrev, IconNext, IconPlay, IconPause, IconRepeat, IconRepeatOne, IconVolume,
} from "./icons";
import type { Track } from "../types";

function fmt(sec: number): string {
  if (!isFinite(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ReplayGain: multiply base volume by the linear track gain (capped at 1 for <audio>).
function effVolume(base: number, track: Track | undefined, replaygain: boolean): number {
  const g = replaygain && track?.gain ? track.gain : 1;
  return Math.max(0, Math.min(1, base * g));
}

export default function PlayerBar() {
  const slot0 = useRef<HTMLAudioElement | null>(null);
  const slot1 = useRef<HTMLAudioElement | null>(null);
  const active = useRef(0);            // which slot maps to the current track
  const fading = useRef(false);        // crossfade in progress
  const advancing = useRef(false);     // suppress duplicate onEnded during crossfade

  const s = usePlayerStore();
  const { crossfade, replaygain } = useSettingsStore();
  const current = s.queue[s.currentIndex];
  const next = s.queue[s.currentIndex + 1];

  const getActive = () => (active.current === 0 ? slot0 : slot1).current;
  const getInactive = () => (active.current === 0 ? slot1 : slot0).current;

  // Load current into the active slot (or seamlessly swap if it was preloaded).
  useEffect(() => {
    const a = getActive();
    if (!a || !current) return;
    const desired = fileUrl(current.file_path);
    const inactive = getInactive();

    if (a.src !== desired) {
      if (inactive && inactive.src === desired) {
        active.current = 1 - active.current; // preloaded → just swap
      } else {
        a.src = desired;
        a.load();
      }
    }
    const cur = getActive();
    if (cur) {
      cur.volume = effVolume(s.volume, current, replaygain);
      if (s.isPlaying) cur.play().catch(() => {});
    }
    // preload the next track into the (now) inactive slot for gapless/crossfade
    const inact = getInactive();
    if (inact) {
      const nsrc = next ? fileUrl(next.file_path) : "";
      if (inact.src !== nsrc) { inact.src = nsrc; inact.volume = 0; }
    }
    advancing.current = false;
    fading.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Play / pause the active slot.
  useEffect(() => {
    const a = getActive();
    if (!a) return;
    if (s.isPlaying) a.play().catch(() => {});
    else a.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.isPlaying]);

  // Volume / ReplayGain changes.
  useEffect(() => {
    const a = getActive();
    if (a && !fading.current) a.volume = effVolume(s.volume, current, replaygain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.volume, replaygain]);

  // Honour seek requests.
  useEffect(() => {
    const a = getActive();
    if (a && s.seekReq !== null) {
      a.currentTime = s.seekReq;
      if (s.isPlaying) a.play().catch(() => {});
      s.clearSeek();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.seekReq]);

  const startCrossfade = (a: HTMLAudioElement) => {
    const b = getInactive();
    if (!b || !next) return;
    fading.current = true;
    advancing.current = true;
    const targetB = effVolume(s.volume, next, replaygain);
    const dur = Math.max(0.1, crossfade);
    b.currentTime = 0;
    b.volume = 0;
    b.play().catch(() => {});
    const startVolA = a.volume;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
      a.volume = startVolA * (1 - k);
      b.volume = targetB * k;
      if (k < 1) requestAnimationFrame(step);
      else { a.pause(); s.next(); } // swap handled by the [current] effect
    };
    requestAnimationFrame(step);
  };

  const onTime = (e: SyntheticEvent<HTMLAudioElement>, slot: number) => {
    if (slot !== active.current) return;
    const a = e.currentTarget;
    s.setTime(a.currentTime);
    if (crossfade > 0 && next && !fading.current && a.duration - a.currentTime <= crossfade) {
      startCrossfade(a);
    }
  };

  const onEnded = (slot: number) => {
    if (slot !== active.current) return;
    if (advancing.current) return; // crossfade already advanced
    s.handleEnded();
  };

  return (
    <footer className="h-20 shrink-0 bg-panel2 border-t border-black/40 flex items-center px-6 gap-6">
      <audio ref={slot0} onTimeUpdate={(e) => onTime(e, 0)} onLoadedMetadata={(e) => active.current === 0 && s.setDuration(e.currentTarget.duration)} onEnded={() => onEnded(0)} />
      <audio ref={slot1} onTimeUpdate={(e) => onTime(e, 1)} onLoadedMetadata={(e) => active.current === 1 && s.setDuration(e.currentTarget.duration)} onEnded={() => onEnded(1)} />

      <div className="w-56 min-w-0 flex items-center gap-3">
        <div className="w-12 h-12 shrink-0"><CoverArt /></div>
        <div className="min-w-0">
          <div className="truncate text-sm text-content">{current?.title ?? "Nada tocando"}</div>
          <div className="truncate text-xs text-muted">{current?.format?.toUpperCase() ?? ""}</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center gap-1">
        <div className="flex items-center gap-5">
          <button title="Aleatório (S)" onClick={s.toggleShuffle} className={s.shuffle ? "text-brand" : "text-muted hover:text-content"}><IconShuffle size={18} /></button>
          <button title="Anterior" onClick={s.prev} className="text-muted hover:text-content"><IconPrev size={22} /></button>
          <button title="Play/Pause (Espaço)" onClick={s.toggle} className="w-9 h-9 rounded-full bg-content text-ink flex items-center justify-center hover:scale-105 transition">
            {s.isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
          </button>
          <button title="Próxima (Shift+→)" onClick={s.next} className="text-muted hover:text-content"><IconNext size={22} /></button>
          <button title="Repetir (R)" onClick={s.cycleRepeat} className={s.repeat !== "off" ? "text-brand" : "text-muted hover:text-content"}>
            {s.repeat === "one" ? <IconRepeatOne size={18} /> : <IconRepeat size={18} />}
          </button>
        </div>
        <div className="w-full max-w-xl flex items-center gap-2 text-[11px] text-muted">
          <span>{fmt(s.currentTime)}</span>
          <input type="range" min={0} max={s.duration || 0} step={0.1} value={s.currentTime}
            onChange={(e) => s.requestSeek(Number(e.target.value))} className="flex-1 accent-brand h-1" />
          <span>{fmt(s.duration)}</span>
        </div>
      </div>

      <div className="w-56 flex items-center justify-end gap-3">
        <button title="Alternar layout (L)" onClick={s.toggleLayout} className="text-muted hover:text-content text-sm">
          {s.layout === "album" ? "Navegação" : "Álbum"}
        </button>
        <span className="text-muted"><IconVolume size={17} /></span>
        <input type="range" min={0} max={1} step={0.01} value={s.volume}
          onChange={(e) => s.setVolume(Number(e.target.value))} className="w-20 accent-brand h-1" />
      </div>
    </footer>
  );
}
