import { create } from "zustand";
import type { Settings, ThemeMode } from "../types";
import { api } from "../lib/ipc";

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (t: ThemeMode) => void;
  setCrossfade: (s: number) => void;
  setReplaygain: (b: boolean) => void;
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "dark",
  crossfade: 0,
  replaygain: false,
  loaded: false,

  load: async () => {
    try {
      const s = await api.getSettings();
      const theme = (s.theme as ThemeMode) || "dark";
      const crossfade = s.crossfade ? Number(s.crossfade) : 0;
      const replaygain = s.replaygain === "true";
      applyTheme(theme);
      set({ theme, crossfade, replaygain, loaded: true });
    } catch {
      applyTheme(get().theme);
      set({ loaded: true }); // browser preview: keep defaults
    }
  },
  setTheme: (theme) => { applyTheme(theme); set({ theme }); api.setSetting("theme", theme).catch(() => {}); },
  setCrossfade: (crossfade) => { set({ crossfade }); api.setSetting("crossfade", String(crossfade)).catch(() => {}); },
  setReplaygain: (replaygain) => { set({ replaygain }); api.setSetting("replaygain", String(replaygain)).catch(() => {}); },
}));
