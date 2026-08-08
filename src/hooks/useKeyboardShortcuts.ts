import { useEffect } from "react";
import type { Screen } from "../types";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";

/** Global shortcuts. Ignored while typing, and never hijacking the OS
 *  combinations (Ctrl/Cmd + key) that the webview already handles. */
/** Salto das setas ← / →. */
const SEEK_STEP_MS = 5_000;

export function useKeyboardShortcuts(navigate?: (s: Screen) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const p = usePlayerStore.getState();
      switch (e.key) {
        case " ": e.preventDefault(); p.toggle(); break;
        case "ArrowRight":
          if (e.shiftKey) p.next();
          else p.requestSeek(Math.min(p.durationMs, p.positionMs + SEEK_STEP_MS));
          break;
        case "ArrowLeft":
          if (e.shiftKey) p.prev();
          else p.requestSeek(Math.max(0, p.positionMs - SEEK_STEP_MS));
          break;
        case "ArrowUp": e.preventDefault(); p.setVolume(Math.min(1, p.volume + 0.05)); break;
        case "ArrowDown": e.preventDefault(); p.setVolume(Math.max(0, p.volume - 0.05)); break;
        case "m": case "M": p.toggleMute(); break;
        case "s": case "S": p.toggleShuffle(); break;
        case "r": case "R": p.cycleRepeat(); break;
        case "q": case "Q": p.toggleQueue(); break;
        case "f": case "F": p.setExpanded(!p.expanded); break;
        case "Escape": if (p.expanded) p.setExpanded(false); break;
        case "t": case "T": {
          const s = useSettingsStore.getState();
          s.setTheme(s.theme === "dark" ? "light" : "dark");
          break;
        }
        // 1-5 jump between screens, like the tabs of a browser.
        case "1": navigate?.("library"); break;
        case "2": navigate?.("playlists"); break;
        case "3": navigate?.("search"); break;
        case "4": navigate?.("downloads"); break;
        case "5": navigate?.("settings"); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}

/** Rendered in Configurações so the shortcuts are discoverable, not folklore. */
export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Espaço", action: "Tocar / pausar" },
  { keys: "← / →", action: "Voltar / avançar 5s" },
  { keys: "Shift + ← / →", action: "Faixa anterior / próxima" },
  { keys: "↑ / ↓", action: "Volume" },
  { keys: "M", action: "Mudo" },
  { keys: "S", action: "Aleatório" },
  { keys: "R", action: "Repetir" },
  { keys: "Q", action: "Mostrar/ocultar a fila" },
  { keys: "F", action: "Tela cheia (tocando agora)" },
  { keys: "T", action: "Alternar tema claro/escuro" },
  { keys: "1 – 5", action: "Ir para cada seção do menu" },
];
