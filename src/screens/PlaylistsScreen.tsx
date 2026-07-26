import { useEffect, useState } from "react";
import type { PlaylistCard, Track, PlaylistSort } from "../types";
import { api } from "../lib/ipc";
import { usePlayerStore } from "../store/usePlayerStore";
import CoverArt from "../components/CoverArt";
import { IconPlay, IconChevronUp, IconChevronDown, IconClose } from "../components/icons";

const SORTS: { key: PlaylistSort; label: string }[] = [
  { key: "custom", label: "Personalizada" },
  { key: "recent", label: "Recentes" },
  { key: "alpha", label: "Alfabética" },
  { key: "artist", label: "Artista" },
  { key: "year", label: "Ano" },
];

export default function PlaylistsScreen() {
  const [playlists, setPlaylists] = useState<PlaylistCard[]>([]);
  const [open, setOpen] = useState<PlaylistCard | null>(null);
  const [newName, setNewName] = useState("");

  const load = () => api.listPlaylists().then(setPlaylists).catch(() => setPlaylists([]));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!newName.trim()) return;
    await api.createPlaylist(newName.trim());
    setNewName(""); load();
  };

  if (open) return <PlaylistDetail card={open} onBack={() => { setOpen(null); load(); }} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Playlists</h1>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova playlist…"
            onKeyDown={(e) => e.key === "Enter" && create()}
            className="bg-panel2 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-brand" />
          <button onClick={create} className="px-4 py-2 rounded-lg bg-brand text-content text-sm">Criar</button>
        </div>
      </div>

      {playlists.length === 0 ? (
        <p className="text-muted">Nenhuma playlist ainda. Crie a primeira acima.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
          {playlists.map((p) => (
            <div key={p.id} className="cursor-pointer group" onClick={() => setOpen(p)}>
              <div className="aspect-square group-hover:ring-2 ring-brand rounded-xl overflow-hidden"><CoverArt path={p.cover_path} /></div>
              <div className="mt-2 text-sm text-content truncate">{p.name}</div>
              <div className="text-xs text-muted">{p.track_count} faixas</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaylistDetail({ card, onBack }: { card: PlaylistCard; onBack: () => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [sort, setSort] = useState<PlaylistSort>((card.sort_mode as PlaylistSort) || "custom");
  const setQueue = usePlayerStore((s) => s.setQueue);

  const load = () => api.playlistTracks(card.id).then(setTracks).catch(() => setTracks([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [card.id]);

  const changeSort = async (mode: PlaylistSort) => {
    setSort(mode);
    await api.updatePlaylist(card.id, { sortMode: mode });
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= tracks.length) return;
    const arr = [...tracks];
    [arr[index], arr[next]] = [arr[next], arr[index]];
    setTracks(arr);
    setSort("custom");
    await api.reorderPlaylist(card.id, arr.map((t) => t.id));
  };

  const remove = async (tid: number) => { await api.removeFromPlaylist(card.id, tid); load(); };

  return (
    <div>
      <button onClick={onBack} className="text-sm text-muted hover:text-content mb-4">← Playlists</button>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-24 h-24"><CoverArt path={card.cover_path} /></div>
        <div>
          <h1 className="text-3xl font-bold">{card.name}</h1>
          <div className="text-sm text-muted">{tracks.length} faixas</div>
        </div>
        <button onClick={() => tracks.length && setQueue(tracks, 0)} className="ml-auto px-5 py-2 rounded-lg bg-brand text-content inline-flex items-center gap-2"><IconPlay size={14} /> Tocar</button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted">Ordenar:</span>
        {SORTS.map((sopt) => (
          <button key={sopt.key} onClick={() => changeSort(sopt.key)}
            className={`px-3 py-1 rounded-full text-xs ${sort === sopt.key ? "bg-white text-ink" : "bg-panel2 text-muted hover:text-content"}`}>
            {sopt.label}
          </button>
        ))}
      </div>

      {tracks.length === 0 ? (
        <p className="text-muted">Playlist vazia. Adicione faixas pela Biblioteca (botão +).</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {tracks.map((t, i) => (
              <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 w-8 text-muted">{i + 1}</td>
                <td className="text-content cursor-pointer" title="Tocar" onClick={() => setQueue(tracks, i)}>{t.title}</td>
                <td className="text-muted">{t.genre ?? ""}</td>
                <td className="text-right w-28">
                  {sort === "custom" && (
                    <>
                      <button title="Subir" onClick={() => move(i, -1)} className="text-muted hover:text-content px-1.5 inline-flex align-middle"><IconChevronUp size={15} /></button>
                      <button title="Descer" onClick={() => move(i, 1)} className="text-muted hover:text-content px-1.5 inline-flex align-middle"><IconChevronDown size={15} /></button>
                    </>
                  )}
                  <button title="Remover" onClick={() => remove(t.id)} className="text-muted hover:text-red-300 px-1.5 inline-flex align-middle"><IconClose size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
