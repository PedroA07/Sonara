import { useEffect, useState } from "react";
import type { Track, AlbumCard, Artist } from "../types";
import { api } from "../lib/ipc";
import { usePlayerStore } from "../store/usePlayerStore";
import ImportWizard from "../components/ImportWizard";
import TrackEditor from "../components/TrackEditor";
import AddToPlaylist from "../components/AddToPlaylist";
import CoverArt from "../components/CoverArt";
import { IconEdit, IconPlus, IconPlay } from "../components/icons";

type View = "tracks" | "albums" | "artists";

export default function LibraryScreen() {
  const [view, setView] = useState<View>("tracks");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<AlbumCard[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [q, setQ] = useState("");
  const [openAlbum, setOpenAlbum] = useState<AlbumCard | null>(null);
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [addTrack, setAddTrack] = useState<Track | null>(null);
  const setQueue = usePlayerStore((s) => s.setQueue);

  const load = async () => {
    try {
      if (view === "tracks") setTracks(q ? await api.searchLibrary(q) : await api.listTracks());
      else if (view === "albums") setAlbums(await api.listAlbums());
      else setArtists(await api.listArtists());
    } catch {
      setTracks([]); setAlbums([]); setArtists([]);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view, q]);

  const playAlbum = async (a: AlbumCard) => {
    const t = await api.albumTracks(a.id);
    if (t.length) setQueue(t, 0);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Biblioteca</h1>
        <div className="flex items-center gap-3">
          {view === "tracks" && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar músicas…"
              className="bg-panel2 rounded-lg px-4 py-2 text-sm w-56 outline-none focus:ring-1 ring-brand" />
          )}
          <ImportWizard onImported={load} />
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(["tracks", "albums", "artists"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-full text-sm ${view === v ? "bg-white text-ink" : "bg-panel2 text-muted hover:text-content"}`}>
            {v === "tracks" ? "Músicas" : v === "albums" ? "Álbuns" : "Artistas"}
          </button>
        ))}
      </div>

      {view === "tracks" && (
        tracks.length === 0 ? <Empty /> : (
          <table className="w-full text-sm">
            <thead className="text-muted text-left border-b border-white/10">
              <tr><th className="py-2 w-8">#</th><th>Título</th><th>Gênero</th><th className="text-right">Duração</th><th className="w-20"></th></tr>
            </thead>
            <tbody>
              {tracks.map((t, i) => (
                <tr key={t.id} className="group border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 text-muted">{i + 1}</td>
                  <td className="text-content cursor-pointer" onDoubleClick={() => setQueue(tracks, i)}>{t.title}</td>
                  <td className="text-muted">{t.genre ?? "—"}</td>
                  <td className="text-right text-muted">{t.duration ? Math.round(t.duration) + "s" : "—"}</td>
                  <td className="text-right opacity-0 group-hover:opacity-100">
                    <button title="Editar" onClick={() => setEditTrack(t)} className="text-muted hover:text-content px-1.5 inline-flex align-middle"><IconEdit size={15} /></button>
                    <button title="Adicionar à playlist" onClick={() => setAddTrack(t)} className="text-muted hover:text-content px-1.5 inline-flex align-middle"><IconPlus size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {view === "albums" && (
        albums.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
            {albums.map((a) => (
              <div key={a.id} className="cursor-pointer group" onClick={() => setOpenAlbum(a)}>
                <div className="aspect-square group-hover:ring-2 ring-brand rounded-xl overflow-hidden"><CoverArt path={a.cover_path} /></div>
                <div className="mt-2 text-sm text-content truncate">{a.title}</div>
                <div className="text-xs text-muted truncate">{a.artist_name ?? "Artista desconhecido"} · {a.track_count} faixas</div>
              </div>
            ))}
          </div>
        )
      )}

      {view === "artists" && (
        artists.length === 0 ? <Empty /> : (
          <div className="space-y-1">
            {artists.map((ar) => (
              <div key={ar.id} className="flex items-center justify-between bg-panel rounded-lg px-4 py-3">
                <span className="text-content">{ar.name}</span>
                <span className="text-xs text-muted">{ar.album_count} álbuns</span>
              </div>
            ))}
          </div>
        )
      )}

      {openAlbum && <AlbumModal album={openAlbum} onClose={() => setOpenAlbum(null)} onPlay={playAlbum} />}
      {editTrack && <TrackEditor tracks={[editTrack]} onClose={() => setEditTrack(null)} onSaved={load} />}
      {addTrack && <AddToPlaylist trackId={addTrack.id} onClose={() => setAddTrack(null)} />}
    </div>
  );
}

function Empty() {
  return <p className="text-muted">Nada aqui ainda. Use "Importar pasta" para adicionar músicas (RF-01/RF-02).</p>;
}

function AlbumModal({ album, onClose, onPlay }: {
  album: AlbumCard; onClose: () => void; onPlay: (a: AlbumCard) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [cover, setCover] = useState<string | null>(album.cover_path);
  const [enriching, setEnriching] = useState(false);
  const setQueue = usePlayerStore((s) => s.setQueue);
  useEffect(() => { api.albumTracks(album.id).then(setTracks).catch(() => setTracks([])); }, [album.id]);
  const enrich = async () => {
    setEnriching(true);
    try { const p = await api.enrichAlbum(album.id); if (p) setCover(p); } catch {}
    setEnriching(false);
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40" onClick={onClose}>
      <div className="bg-panel rounded-2xl p-6 w-[560px] max-w-[90vw] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-20 h-20"><CoverArt path={cover} /></div>
          <div>
            <h2 className="text-xl font-bold text-content">{album.title}</h2>
            <div className="text-sm text-muted">{album.artist_name ?? "—"} {album.year ? `· ${album.year}` : ""}</div>
          </div>
          <button onClick={() => onPlay(album)} className="ml-auto px-4 py-2 rounded-lg bg-brand text-content text-sm inline-flex items-center gap-2"><IconPlay size={13} /> Tocar</button>
        </div>
        <ol className="text-sm">
          {tracks.map((t, i) => (
            <li key={t.id} onDoubleClick={() => setQueue(tracks, i)}
                className="flex justify-between py-2 border-b border-white/5 hover:bg-white/5 px-2 rounded cursor-pointer">
              <span className="text-content/90"><span className="text-muted mr-3">{t.track_no ?? i + 1}</span>{t.title}</span>
              <span className="text-muted">{t.duration ? Math.round(t.duration) + "s" : ""}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
