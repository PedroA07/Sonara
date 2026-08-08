import { create } from "zustand";
import type { Lyrics, LyricsResolution } from "../types";
import { api } from "../lib/ipc";
import { toast } from "./useToastStore";

/** Por que a tela está sem letra — determina qual estado vazio mostrar. */
export type LyricsStatus =
  | "idle"        // nenhuma faixa selecionada
  | "loading"
  | "ready"
  | "none"        // procurou e não achou
  | "network-off" // existiria busca online, mas está desligada
  | "error";

interface LyricsState {
  trackId: number | null;
  lyrics: Lyrics | null;
  status: LyricsStatus;
  error: string;
  /** Ajuste de sincronia sendo aplicado — evita salvar duas vezes seguidas. */
  savingOffset: boolean;

  load: (trackId: number, allowNetwork: boolean) => Promise<void>;
  clear: () => void;
  setOffset: (offsetMs: number) => Promise<void>;
  nudgeOffset: (deltaMs: number) => Promise<void>;
  setManual: (content: string) => Promise<void>;
  remove: () => Promise<void>;
  /** "Procurar de novo": esquece o cache negativo e refaz a cadeia. */
  retry: () => Promise<void>;
}

export const useLyricsStore = create<LyricsState>((set, get) => ({
  trackId: null,
  lyrics: null,
  status: "idle",
  error: "",
  savingOffset: false,

  load: async (trackId, allowNetwork) => {
    // Já carregada: trocar de aba não deve piscar a tela.
    if (get().trackId === trackId && get().status === "ready") return;
    set({ trackId, lyrics: null, status: "loading", error: "" });
    try {
      const res: LyricsResolution = await api.lyricsResolve(trackId, allowNetwork);
      // A faixa pode ter mudado enquanto a busca corria.
      if (get().trackId !== trackId) return;

      if (res.lyrics) { set({ lyrics: res.lyrics, status: "ready" }); return; }
      if (res.networkSkipped) { set({ lyrics: null, status: "network-off" }); return; }

      // Nada local e a busca online está ligada: só agora a rede é tocada.
      const online = await api.lyricsFetchOnline(trackId);
      if (get().trackId !== trackId) return;
      set(online.lyrics
        ? { lyrics: online.lyrics, status: "ready" }
        : { lyrics: null, status: "none" });
    } catch (e) {
      if (get().trackId !== trackId) return;
      set({ status: "error", error: String(e) });
    }
  },

  clear: () => set({ trackId: null, lyrics: null, status: "idle", error: "" }),

  setOffset: async (offsetMs) => {
    const { trackId, savingOffset } = get();
    if (trackId == null || savingOffset) return;
    set({ savingOffset: true });
    try {
      const updated = await api.lyricsSetOffset(trackId, offsetMs);
      if (get().trackId === trackId) set({ lyrics: updated });
    } catch (e) {
      toast.error("Não foi possível ajustar a sincronia", String(e));
    } finally {
      set({ savingOffset: false });
    }
  },

  nudgeOffset: async (deltaMs) => {
    const current = get().lyrics?.offsetMs ?? 0;
    await get().setOffset(current + deltaMs);
  },

  setManual: async (content) => {
    const { trackId } = get();
    if (trackId == null) return;
    try {
      const updated = await api.lyricsSetManual(trackId, content);
      set({ lyrics: updated, status: "ready" });
      toast.success("Letra salva");
    } catch (e) {
      toast.error("Não foi possível salvar a letra", String(e));
      throw e;
    }
  },

  retry: async () => {
    const { trackId } = get();
    if (trackId == null) return;
    try {
      await api.lyricsForgetMiss(trackId);
      set({ status: "loading" });
      const online = await api.lyricsFetchOnline(trackId);
      if (get().trackId !== trackId) return;
      set(online.lyrics
        ? { lyrics: online.lyrics, status: "ready" }
        : { lyrics: null, status: "none" });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  remove: async () => {
    const { trackId } = get();
    if (trackId == null) return;
    try {
      await api.lyricsDelete(trackId);
      set({ lyrics: null, status: "none" });
      toast.success("Letra removida desta faixa");
    } catch (e) {
      toast.error("Não foi possível remover", String(e));
    }
  },
}));
