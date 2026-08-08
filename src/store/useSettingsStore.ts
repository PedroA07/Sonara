import { create } from "zustand";
import type { AudioFormat, Settings, ThemeMode } from "../types";
import { api } from "../lib/ipc";

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (t: ThemeMode) => void;
  setCrossfade: (s: number) => void;
  setReplaygain: (b: boolean) => void;
  setDownloadDir: (p: string) => void;
  setAudioFormat: (f: AudioFormat) => void;
  setLyricsProviderEnabled: (b: boolean) => void;
  setLyricsMiniLine: (b: boolean) => void;
  setLyricsAutoFetchOnDownload: (b: boolean) => void;
  setVideoQuality: (q: string) => void;
}

const systemTheme = (): "dark" | "light" =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";

/** "system" follows the OS; the attribute is always a concrete theme so the CSS
 *  only ever has two branches to reason about. */
function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme === "system" ? systemTheme() : theme);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "dark",
  crossfade: 0,
  replaygain: false,
  downloadDir: "",
  audioFormat: "m4a",
  // Busca online de letra: desligada por padrão. É consulta a serviço de
  // terceiro, então precisa ser escolha explícita de quem usa.
  lyricsProviderEnabled: false,
  lyricsMiniLine: true,
  lyricsAutoFetchOnDownload: false,
  // 720p: cabe na janela, baixa rápido e não enche o disco (ADR-05).
  videoQuality: "720p",
  loaded: false,

  load: async () => {
    try {
      const [s, defaults] = await Promise.all([
        api.getSettings(),
        api.defaultPaths().catch(() => ({}) as Record<string, string>),
      ]);
      const theme = (s.theme as ThemeMode) || "dark";
      applyTheme(theme);
      set({
        theme,
        crossfade: s.crossfade ? Number(s.crossfade) : 0,
        replaygain: s.replaygain === "true",
        downloadDir: s.download_dir || defaults.download_dir || "",
        audioFormat: (s.audio_format as AudioFormat) || "m4a",
        lyricsProviderEnabled: s.lyrics_provider_enabled === "true",
        lyricsMiniLine: s.lyrics_mini_line !== "false",
        lyricsAutoFetchOnDownload: s.lyrics_auto_fetch_on_download === "true",
        videoQuality: s.video_quality || "720p",
        loaded: true,
      });
    } catch {
      applyTheme(get().theme);
      set({ loaded: true }); // browser preview: keep defaults
    }
  },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
    api.setSetting("theme", theme).catch(() => {});
  },
  setCrossfade: (crossfade) => {
    set({ crossfade });
    api.setSetting("crossfade", String(crossfade)).catch(() => {});
  },
  setReplaygain: (replaygain) => {
    set({ replaygain });
    api.setSetting("replaygain", String(replaygain)).catch(() => {});
  },
  setDownloadDir: (downloadDir) => {
    set({ downloadDir });
    api.setSetting("download_dir", downloadDir).catch(() => {});
  },
  setAudioFormat: (audioFormat) => {
    set({ audioFormat });
    api.setSetting("audio_format", audioFormat).catch(() => {});
  },
  setLyricsProviderEnabled: (lyricsProviderEnabled) => {
    set({ lyricsProviderEnabled });
    api.setSetting("lyrics_provider_enabled", String(lyricsProviderEnabled)).catch(() => {});
    // Desligar a busca online desliga junto o que depende dela: deixar a busca
    // automática ligada sem efeito nenhum é a receita de "achei que estava
    // funcionando".
    if (!lyricsProviderEnabled && get().lyricsAutoFetchOnDownload) {
      get().setLyricsAutoFetchOnDownload(false);
    }
  },
  setLyricsMiniLine: (lyricsMiniLine) => {
    set({ lyricsMiniLine });
    api.setSetting("lyrics_mini_line", String(lyricsMiniLine)).catch(() => {});
  },
  setLyricsAutoFetchOnDownload: (lyricsAutoFetchOnDownload) => {
    set({ lyricsAutoFetchOnDownload });
    api.setSetting("lyrics_auto_fetch_on_download", String(lyricsAutoFetchOnDownload)).catch(() => {});
  },
  setVideoQuality: (videoQuality) => {
    set({ videoQuality });
    api.setSetting("video_quality", videoQuality).catch(() => {});
  },
}));

// Re-apply on OS theme changes while "system" is selected.
if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
    if (useSettingsStore.getState().theme === "system") applyTheme("system");
  });
}
