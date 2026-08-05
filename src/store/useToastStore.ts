import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Optional single action, e.g. "Abrir pasta" after an export. */
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">, ttlMs?: number) => number;
  dismiss: (id: number) => void;
}

let seq = 1;

/** Transient feedback. Every long-running action (download, export, save)
 *  reports its outcome here, so nothing ever completes silently. */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (t, ttlMs = t.tone === "error" ? 9000 : 5000) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    if (ttlMs > 0) window.setTimeout(() => get().dismiss(id), ttlMs);
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string, action?: Toast["action"]) =>
    useToastStore.getState().push({ tone: "success", title, description, action }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: "error", title, description }),
  info: (title: string, description?: string, action?: Toast["action"]) =>
    useToastStore.getState().push({ tone: "info", title, description, action }),
};
