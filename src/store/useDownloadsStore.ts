import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { DownloadProgress, DestKind } from "../types";
import { api } from "../lib/ipc";

export interface JobView {
  id: number;
  input: string;
  dest: DestKind;
  status: "running" | "done" | "error";
  progress: number;
  message: string;
}

interface DownloadsState {
  jobs: Record<number, JobView>;
  listening: boolean;
  init: () => Promise<void>;
  start: (input: string, dest: DestKind, destId?: number) => Promise<void>;
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  jobs: {},
  listening: false,

  init: async () => {
    if (get().listening) return;
    set({ listening: true });
    try {
      await listen<DownloadProgress>("download-progress", (e) => {
        const p = e.payload;
        set((s) => {
          const prev = s.jobs[p.job_id];
          if (!prev) return s;
          return {
            jobs: {
              ...s.jobs,
              [p.job_id]: {
                ...prev,
                status: p.status,
                progress: p.progress >= 0 ? p.progress : prev.progress,
                message: p.message || prev.message,
              },
            },
          };
        });
      });
    } catch {
      // browser preview: no event bridge
    }
  },

  start: async (input, dest, destId) => {
    try {
      const id = await api.startDownload(input, dest, destId);
      set((s) => ({ jobs: { ...s.jobs, [id]: { id, input, dest, status: "running", progress: 0, message: "" } } }));
    } catch (e) {
      const id = -Date.now();
      set((s) => ({ jobs: { ...s.jobs, [id]: { id, input, dest, status: "error", progress: 0, message: "Requer o app Tauri (preview)" } } }));
    }
  },
}));
