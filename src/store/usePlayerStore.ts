import { create } from "zustand";
import type { Track, RepeatMode } from "../types";

interface PlayerState {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  layout: "album" | "browse";
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  seekReq: number | null; // set to request the <audio> to seek
  showQueue: boolean;     // right-hand queue panel visibility
  expanded: boolean;      // full-screen "now playing" view

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
  setTime: (t: number) => void;
  setDuration: (d: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  requestSeek: (t: number) => void;
  clearSeek: () => void;
}

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

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  shuffle: false,
  repeat: "off",
  layout: "browse",
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  seekReq: null,
  showQueue: true,
  expanded: false,

  setQueue: (tracks, startAt = 0) =>
    set({ queue: tracks, currentIndex: startAt, isPlaying: true, currentTime: 0 }),
  // Clicking a row in the queue plays it, rather than only highlighting it.
  jumpTo: (index) =>
    set((s) =>
      index >= 0 && index < s.queue.length
        ? { currentIndex: index, currentTime: 0, isPlaying: true }
        : s
    ),
  toggleQueue: () => set((s) => ({ showQueue: !s.showQueue })),
  setExpanded: (v) => set({ expanded: v }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set((s) => ({ isPlaying: !s.isPlaying })),
  next: () => {
    const { currentIndex, queue, shuffle } = get();
    const n = pickNext(currentIndex, queue.length, shuffle);
    if (n !== null) set({ currentIndex: n, currentTime: 0, isPlaying: true });
  },
  prev: () => {
    const { currentIndex, currentTime } = get();
    // restart the track if we're past 3s, else go to previous (common player UX)
    if (currentTime > 3) return set({ seekReq: 0 });
    if (currentIndex > 0) set({ currentIndex: currentIndex - 1, currentTime: 0, isPlaying: true });
    else set({ seekReq: 0 });
  },
  handleEnded: () => {
    const { repeat, currentIndex, queue, shuffle } = get();
    if (repeat === "one") return set({ seekReq: 0, isPlaying: true });
    const n = pickNext(currentIndex, queue.length, shuffle);
    if (n !== null) set({ currentIndex: n, currentTime: 0, isPlaying: true });
    else if (repeat === "all" && queue.length > 0) set({ currentIndex: 0, currentTime: 0, isPlaying: true });
    else set({ isPlaying: false });
  },
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),
  toggleLayout: () => set((s) => ({ layout: s.layout === "album" ? "browse" : "album" })),
  setTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  // Dragging the volume up is also the natural way to unmute.
  setVolume: (v) => set({ volume: v, muted: v === 0 ? true : false }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  requestSeek: (t) => set({ seekReq: t }),
  clearSeek: () => set({ seekReq: null }),
}));
