import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { DownloadProgress, DestKind, JobStatus } from "../types";
import { api } from "../lib/ipc";
import { toast } from "./useToastStore";

export interface JobView {
  id: number;
  input: string;
  /** Video title once yt-dlp reports it — nicer than showing a raw URL. */
  title: string;
  dest: DestKind;
  status: JobStatus;
  progress: number;
  message: string;
  speed: string;
  eta: string;
  filePath: string | null;
}

interface DownloadsState {
  jobs: Record<number, JobView>;
  listening: boolean;
  init: () => Promise<void>;
  start: (input: string, dest: DestKind, destId?: number, label?: string) => Promise<void>;
  cancel: (id: number) => Promise<void>;
  clearFinished: () => void;
}

/** Live download state. The backend owns the truth (and persists every job);
 *  this mirrors the in-flight ones so the UI can react instantly. */
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
                message: p.message || (p.status === "running" ? prev.message : ""),
                title: p.title || prev.title,
                speed: p.speed ?? "",
                eta: p.eta ?? "",
                filePath: p.filePath ?? prev.filePath,
              },
            },
          };
        });

        // One notification per finished job, wherever the user happens to be.
        const name = p.title || get().jobs[p.job_id]?.input || "";
        if (p.status === "done") {
          toast.success(
            "Download concluído",
            name,
            p.filePath
              ? { label: "Abrir pasta", run: () => { api.openPath(p.filePath!).catch(() => {}); } }
              : undefined
          );
        } else if (p.status === "error") {
          toast.error("O download falhou", p.message || name);
        }
      });
    } catch {
      // browser preview: no event bridge
    }
  },

  start: async (input, dest, destId, label) => {
    try {
      const id = await api.startDownload(input, dest, destId);
      set((s) => ({
        jobs: {
          ...s.jobs,
          [id]: {
            id, input, title: label ?? "", dest, status: "running",
            progress: 0, message: "Iniciando…", speed: "", eta: "", filePath: null,
          },
        },
      }));
    } catch (e) {
      // Surface the backend's message (missing yt-dlp, unwritable folder, …)
      // instead of leaving the user staring at a button that did nothing.
      toast.error("Não foi possível iniciar o download", String(e));
    }
  },

  cancel: async (id) => {
    try {
      await api.cancelDownload(id);
      set((s) => (s.jobs[id]
        ? { jobs: { ...s.jobs, [id]: { ...s.jobs[id], status: "canceled", message: "Cancelado" } } }
        : s));
    } catch (e) {
      toast.error("Não foi possível cancelar", String(e));
    }
  },

  clearFinished: () =>
    set((s) => ({
      jobs: Object.fromEntries(Object.entries(s.jobs).filter(([, j]) => j.status === "running")),
    })),
}));
