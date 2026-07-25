import { useEffect } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";

// Global media keyboard shortcuts (F3). Ignored while typing in inputs.
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const p = usePlayerStore.getState();
      switch (e.key) {
        case " ": e.preventDefault(); p.toggle(); break;
        case "ArrowRight": if (e.shiftKey) p.next(); else p.requestSeek(Math.min(p.duration, p.currentTime + 5)); break;
        case "ArrowLeft": if (e.shiftKey) p.prev(); else p.requestSeek(Math.max(0, p.currentTime - 5)); break;
        case "ArrowUp": e.preventDefault(); p.setVolume(Math.min(1, p.volume + 0.05)); break;
        case "ArrowDown": e.preventDefault(); p.setVolume(Math.max(0, p.volume - 0.05)); break;
        case "s": case "S": p.toggleShuffle(); break;
        case "r": case "R": p.cycleRepeat(); break;
        case "l": case "L": p.toggleLayout(); break;
        case "t": case "T": {
          const s = useSettingsStore.getState();
          s.setTheme(s.theme === "dark" ? "light" : "dark");
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
