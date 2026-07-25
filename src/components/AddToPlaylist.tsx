import { useEffect, useState } from "react";
import type { PlaylistCard } from "../types";
import { api } from "../lib/ipc";

// Small picker to add a track to an existing playlist or a new one (RF-04).
export default function AddToPlaylist({ trackId, onClose }: { trackId: number; onClose: () => void }) {
  const [playlists, setPlaylists] = useState<PlaylistCard[]>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => { api.listPlaylists().then(setPlaylists).catch(() => setPlaylists([])); }, []);

  const add = async (pid: number) => { await api.addToPlaylist(pid, [trackId]); onClose(); };
  const createAndAdd = async () => {
    if (!newName.trim()) return;
    const pid = await api.createPlaylist(newName.trim());
    await api.addToPlaylist(pid, [trackId]);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel rounded-2xl p-6 w-[380px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Adicionar à playlist</h2>
        <div className="space-y-1 max-h-56 overflow-y-auto mb-4">
          {playlists.length === 0 && <p className="text-sm text-muted">Nenhuma playlist ainda.</p>}
          {playlists.map((p) => (
            <button key={p.id} onClick={() => add(p.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-content hover:bg-white/10">
              {p.name} <span className="text-muted">· {p.track_count}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova playlist…"
            className="flex-1 bg-panel2 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-brand" />
          <button onClick={createAndAdd} className="px-3 py-2 rounded-lg bg-brand text-content text-sm">Criar</button>
        </div>
      </div>
    </div>
  );
}
