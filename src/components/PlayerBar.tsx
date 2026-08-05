import { useEffect, useRef, type SyntheticEvent } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { fileUrl } from "../lib/ipc";
import { artistOf, fmtClock } from "../lib/format";
import CoverArt from "./CoverArt";
import { IconButton } from "./ui";
import {
  IconShuffle, IconPrev, IconNext, IconPlay, IconPause, IconRepeat, IconRepeatOne,
  IconVolume, IconQueue, IconChevronUp, IconGrid, IconList,
} from "./icons";
import type { Track } from "../types";

// ReplayGain: multiply base volume by the linear track gain (capped at 1 for <audio>).
function effVolume(base: number, track: Track | undefined, replaygain: boolean, muted: boolean): number {
  if (muted) return 0;
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
      cur.volume = effVolume(s.volume, current, replaygain, s.muted);
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

  // Volume / mute / ReplayGain changes.
  useEffect(() => {
    const a = getActive();
    if (a && !fading.current) a.volume = effVolume(s.volume, current, replaygain, s.muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.volume, s.muted, replaygain]);

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
    const targetB = effVolume(s.volume, next, replaygain, s.muted);
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

  const pct = s.duration > 0 ? (s.currentTime / s.duration) * 100 : 0;
  const volPct = (s.muted ? 0 : s.volume) * 100;
  const hasTrack = !!current;

  return (
    <footer className="h-[84px] shrink-0 bg-panel border-t divider flex items-center px-5 gap-5 relative z-20">
      <audio ref={slot0} onTimeUpdate={(e) => onTime(e, 0)} onLoadedMetadata={(e) => active.current === 0 && s.setDuration(e.currentTarget.duration)} onEnded={() => onEnded(0)} />
      <audio ref={slot1} onTimeUpdate={(e) => onTime(e, 1)} onLoadedMetadata={(e) => active.current === 1 && s.setDuration(e.currentTarget.duration)} onEnded={() => onEnded(1)} />

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
            {current ? artistOf(current) : "Escolha uma música na biblioteca"}
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
          <span className="w-9 text-right">{fmtClock(s.currentTime)}</span>
          <input
            type="range" min={0} max={s.duration || 0} step={0.1} value={s.currentTime}
            onChange={(e) => s.requestSeek(Number(e.target.value))}
            disabled={!hasTrack}
            aria-label="Posição na música"
            className="flex-1 track-range"
            style={{ ["--pct" as string]: `${pct}%` }}
          />
          <span className="w-9">{fmtClock(s.duration)}</span>
        </div>
      </div>

      {/* ── Right-hand controls ───────────────────────────────────── */}
      <div className="w-[260px] flex items-center justify-end gap-1">
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
