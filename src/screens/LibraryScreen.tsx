import { useEffect, useState } from "react";
import type { Track, AlbumCard, Artist } from "../types";
import { api } from "../lib/ipc";
import { usePlayerStore } from "../store/usePlayerStore";
import ImportWizard from "../components/ImportWizard";
import TrackEditor from "../components/TrackEditor";
import AddToPlaylist from "../components/AddToPlaylist";
import CoverArt from "../components/CoverArt";
import { IconEdit, IconPlus, IconPlay, IconTrash } from "../components/icons";

type View = "tracks" | "albums" | "artists" | "genres";

export default function LibraryScreen() {
  const [view, setView] = useState<View>("tracks");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<AlbumCard[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<{ name: string; count: number }[]>([]);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openAlbum, setOpenAlbum] = useState<AlbumCard | null>(null);
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [addTrack, setAddTrack] = useState<Track | null>(null);
  const setQueue = usePlayerStore((s) => s.setQueue);

  const load = async () => {
    try {
      if (view === "tracks") setTracks(q ? await api.searchLibrary(q) : await api.listTracks());
      else if (view === "albums") setAlbums(await api.listAlbums());
      else if (view === "artists") setArtists(await api.listArtists());
      else {
        // Genres are derived from the library (no dedicated table).
        const all = await api.listTracks();
        const counts = new Map<string, number>();
        for (const t of all) {
          const g = (t.genre ?? "").trim() || "Sem gênero";
          counts.set(g, (counts.get(g) ?? 0) + 1);
        }
        setGenres([...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch {
      setTracks([]); setAlbums([]); setArtists([]); setGenres([]);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view, q]);

  const genreOf = (t: Track) => (t.genre ?? "").trim() || "Sem gênero";
  const shownTracks = genreFilter ? tracks.filter((t) => genreOf(t) === genreFilter) : tracks;

  const playAlbum = async (a: AlbumCard) => {
    const t = await api.albumTracks(a.id);
    if (t.length) setQueue(t, 0);
  };

  const del = async (t: Track) => {
    if (!window.confirm(`Remover "${t.title}" da biblioteca? (o arquivo não é apagado do disco)`)) return;
    try { await api.deleteTracks([t.id]); load(); } catch { /* ignore */ }
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
        {(["tracks", "albums", "artists", "genres"] as View[]).map((v) => (
          <button key={v} onClick={() => { setView(v); setGenreFilter(null); }}
            className={`px-4 py-1.5 rounded-full text-sm ${view === v ? "bg-white text-ink" : "bg-panel2 text-muted hover:text-content"}`}>
            {v === "tracks" ? "Músicas" : v === "albums" ? "Álbuns" : v === "artists" ? "Artistas" : "Gêneros"}
          </button>
        ))}
      </div>

      {view === "tracks" && (
        <>
          {genreFilter && (
            <div className="mb-4 flex items-center gap-2 text-sm text-muted">
              Gênero: <span className="text-content">{genreFilter}</span>
              <button onClick={() => setGenreFilter(null)} className="text-brand hover:underline">limpar</button>
            </div>
          )}
          {shownTracks.length === 0 ? <Empty /> : (
            <table className="w-full text-sm">
              <thead className="text-muted text-left border-b border-white/10">
                <tr><th className="py-2 w-8">#</th><th>Título</th><th>Gênero</th><th className="text-right">Duração</th><th className="w-20"></th></tr>
              </thead>
              <tbody>
                {shownTracks.map((t, i) => (
                  <tr key={t.id} className="group border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 text-muted">{i + 1}</td>
                    <td className="text-content cursor-pointer" title="Tocar" onClick={() => setQueue(shownTracks, i)}>{t.title}</td>
                    <td className="text-muted">{t.genre ?? "—"}</td>
                    <td className="text-right text-muted">{t.duration ? Math.round(t.duration) + "s" : "—"}</td>
                    <td className="text-right whitespace-nowrap opacity-0 group-hover:opacity-100">
                      <button title="Editar" onClick={() => setEditTrack(t)} className="text-muted hover:text-content px-1.5 inline-flex align-middle"><IconEdit size={15} /></button>
                      <button title="Adicionar à playlist" onClick={() => setAddTrack(t)} className="text-muted hover:text-content px-1.5 inline-flex align-middle"><IconPlus size={15} /></button>
                      <button title="Remover da biblioteca" onClick={() => del(t)} className="text-muted hover:text-red-300 px-1.5 inline-flex align-middle"><IconTrash size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
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

      {view === "genres" && (
        genres.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
            {genres.map((g) => (
              <button key={g.name} onClick={() => { setGenreFilter(g.name); setQ(""); setView("tracks"); }}
                className="text-left bg-panel rounded-xl px-4 py-3 hover:bg-panel2 transition">
                <div className="text-content truncate">{g.name}</div>
                <div className="text-xs text-muted">{g.count} faixa(s)</div>
              </button>
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
            <li key={t.id} onClick={() => setQueue(tracks, i)} title="Tocar"
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
