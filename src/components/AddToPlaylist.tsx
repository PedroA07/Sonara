import { useEffect, useState } from "react";
import type { PlaylistCard } from "../types";
import { api } from "../lib/ipc";
import { toast } from "../store/useToastStore";
import { Button, Modal, TextField } from "./ui";
import { IconPlaylists, IconPlus } from "./icons";

/** Add a track to an existing playlist, or create one on the spot (RF-04). */
export default function AddToPlaylist({ trackId, onClose }: { trackId: number; onClose: () => void }) {
  const [playlists, setPlaylists] = useState<PlaylistCard[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.listPlaylists().then(setPlaylists).catch(() => setPlaylists([])); }, []);

  const add = async (p: PlaylistCard) => {
    setBusy(true);
    try {
      await api.addToPlaylist(p.id, [trackId]);
      toast.success("Adicionada à playlist", p.name);
      onClose();
    } catch (e) {
      toast.error("Não foi possível adicionar", String(e));
      setBusy(false);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const pid = await api.createPlaylist(name);
      await api.addToPlaylist(pid, [trackId]);
      toast.success("Playlist criada", `“${name}” já tem a sua música.`);
      onClose();
    } catch (e) {
      toast.error("Não foi possível criar a playlist", String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Adicionar a uma playlist" onClose={onClose} width="w-[420px]">
      <div className="space-y-4 pb-2">
        <div className="space-y-1 max-h-60 overflow-y-auto -mx-1 px-1">
          {playlists.length === 0 ? (
            <p className="text-sm text-muted py-3">
              Você ainda não tem playlists. Crie a primeira abaixo.
            </p>
          ) : (
            playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p)}
                disabled={busy}
                className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm
                  text-content hover:bg-line/[.07] transition-colors disabled:opacity-50"
              >
                <span className="w-8 h-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0">
                  <IconPlaylists size={15} />
                </span>
                <span className="truncate flex-1">{p.name}</span>
                <span className="text-xs text-muted shrink-0">{p.track_count}</span>
              </button>
            ))
          )}
        </div>

        <div className="pt-1 border-t divider">
          <div className="flex items-end gap-2 pt-3">
            <TextField
              label="Criar uma nova playlist"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
              placeholder="Nome da playlist"
              className="flex-1"
            />
            <Button variant="primary" onClick={createAndAdd} disabled={!newName.trim() || busy}>
              <IconPlus size={15} /> Criar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
