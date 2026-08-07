import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Track, AlbumCard, Artist } from "../types";
import { api } from "../lib/ipc";
import { artistOf, fmtDuration, fmtTotal } from "../lib/format";
import { usePlayerStore } from "../store/usePlayerStore";
import { toast } from "../store/useToastStore";
import ImportWizard from "../components/ImportWizard";
import TrackEditor from "../components/TrackEditor";
import AddToPlaylist from "../components/AddToPlaylist";
import ExportModal from "../components/ExportModal";
import CoverArt from "../components/CoverArt";
import {
  Badge, Button, Checkbox, EmptyState, Equalizer, IconButton, Modal, PageHeader, Segmented, Spinner,
} from "../components/ui";
import {
  IconEdit, IconPlus, IconPlay, IconTrash, IconSearch, IconExport, IconMusic, IconSparkle, IconFolder,
} from "../components/icons";

type View = "tracks" | "albums" | "artists" | "genres";
type Sort = "recent" | "title" | "artist" | "duration";

const VIEWS: { value: View; label: string }[] = [
  { value: "tracks", label: "Músicas" },
  { value: "albums", label: "Álbuns" },
  { value: "artists", label: "Artistas" },
  { value: "genres", label: "Gêneros" },
];

export default function LibraryScreen() {
  const [view, setView] = useState<View>("tracks");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<AlbumCard[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const [openAlbum, setOpenAlbum] = useState<AlbumCard | null>(null);
  const [editing, setEditing] = useState<Track[] | null>(null);
  const [addingTo, setAddingTo] = useState<Track | null>(null);
  const [exporting, setExporting] = useState<Track[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Track[] | null>(null);

  const setQueue = usePlayerStore((s) => s.setQueue);
  const playing = usePlayerStore((s) => s.queue[s.currentIndex]);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "albums") setAlbums(await api.listAlbums());
      else if (view === "artists") setArtists(await api.listArtists());
      else setTracks(q ? await api.searchLibrary(q) : await api.listTracks());
    } catch {
      setTracks([]); setAlbums([]); setArtists([]);
    } finally {
      setLoading(false);
    }
  }, [view, q]);

  useEffect(() => { load(); }, [load]);

  // A finished download should appear without the user having to do anything.
  useEffect(() => {
    let un: (() => void) | undefined;
    listen("library-changed", () => { load(); }).then((f) => { un = f; }).catch(() => {});
    return () => { un?.(); };
  }, [load]);

  // Genres are derived from the loaded tracks — there is no genre table.
  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks) {
      const g = (t.genre ?? "").trim() || "Sem gênero";
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [tracks]);

  const shown = useMemo(() => {
    const list = genreFilter
      ? tracks.filter((t) => ((t.genre ?? "").trim() || "Sem gênero") === genreFilter)
      : tracks;
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    else if (sort === "artist") sorted.sort((a, b) => artistOf(a).localeCompare(artistOf(b), "pt-BR"));
    else if (sort === "duration") sorted.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
    return sorted; // "recent" = backend order (date_added DESC)
  }, [tracks, genreFilter, sort]);

  const selectedTracks = useMemo(() => shown.filter((t) => selected.has(t.id)), [shown, selected]);
  const allSelected = shown.length > 0 && selectedTracks.length === shown.length;

  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(shown.map((t) => t.id)));

  const doDelete = async (list: Track[]) => {
    try {
      await api.deleteTracks(list.map((t) => t.id));
      toast.success(
        list.length === 1 ? "Música removida da biblioteca" : `${list.length} músicas removidas`,
        "Os arquivos continuam no disco."
      );
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error("Não foi possível remover", String(e));
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="pb-4">
      <PageHeader
        title="Biblioteca"
        subtitle="Tudo o que você já baixou ou importou. Clique numa música para tocar; selecione várias para editar ou exportar."
        actions={<ImportWizard onImported={load} />}
      />

      {/* Toolbar: view + search + sort, in one row that always means the same. */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Segmented
          value={view}
          onChange={(v) => { setView(v); setGenreFilter(null); setSelected(new Set()); }}
          options={VIEWS}
        />

        <div className="relative ml-auto">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setView("tracks"); }}
            placeholder="Buscar por título, artista ou álbum…"
            aria-label="Buscar na biblioteca"
            className="w-64 h-9 pl-9 pr-3 bg-panel2 border border-line/[.09] rounded-xl text-sm
              placeholder:text-muted/70 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/25"
          />
        </div>

        {view === "tracks" && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Ordenar por"
            className="h-9 px-3 bg-panel2 border border-line/[.09] rounded-xl text-sm text-content outline-none
              focus:border-brand/60 focus:ring-2 focus:ring-brand/25"
          >
            <option value="recent">Adicionadas recentemente</option>
            <option value="title">Título (A–Z)</option>
            <option value="artist">Artista (A–Z)</option>
            <option value="duration">Mais longas</option>
          </select>
        )}
      </div>

      {genreFilter && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <Badge tone="brand">Gênero: {genreFilter}</Badge>
          <button onClick={() => setGenreFilter(null)} className="text-muted hover:text-content text-xs">
            limpar filtro
          </button>
        </div>
      )}

      {loading && tracks.length === 0 && albums.length === 0 ? (
        <div className="flex items-center gap-2 text-muted text-sm py-12 justify-center">
          <Spinner /> Carregando sua biblioteca…
        </div>
      ) : (
        <>
          {view === "tracks" && (
            shown.length === 0 ? (
              q ? (
                <EmptyState
                  icon={<IconSearch size={22} />}
                  title={`Nada encontrado para "${q}"`}
                  description="Tente outras palavras, ou baixe a música em Buscar & Baixar."
                  action={<Button onClick={() => setQ("")}>Limpar a busca</Button>}
                />
              ) : (
                <EmptyState
                  icon={<IconMusic size={22} />}
                  title="Sua biblioteca está vazia"
                  description="Baixe músicas em “Buscar & Baixar” ou importe uma pasta que já esteja no seu computador."
                  action={<ImportWizard onImported={load} />}
                />
              )
            ) : (
              <TrackTable
                tracks={shown}
                selected={selected}
                allSelected={allSelected}
                playingId={playing?.id}
                isPlaying={isPlaying}
                onToggleOne={toggleOne}
                onToggleAll={toggleAll}
                onPlay={(i) => setQueue(shown, i)}
                onEdit={(t) => setEditing([t])}
                onAdd={(t) => setAddingTo(t)}
                onExport={(t) => setExporting([t])}
                onDelete={(t) => setConfirmDelete([t])}
              />
            )
          )}

          {view === "albums" && (
            albums.length === 0 ? (
              <EmptyState icon={<IconMusic size={22} />} title="Nenhum álbum ainda"
                description="Álbuns aparecem aqui assim que suas músicas tiverem essa informação nas tags." />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
                {albums.map((a) => (
                  <button key={a.id} onClick={() => setOpenAlbum(a)}
                    className="text-left group hoverable rounded-2xl p-2 -m-2 hover:bg-line/[.05]">
                    <div className="aspect-square rounded-xl overflow-hidden shadow-soft relative">
                      <CoverArt path={a.cover_path} />
                      <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="w-11 h-11 rounded-full brand-gradient text-white flex items-center justify-center shadow-glow">
                          <IconPlay size={16} className="ml-0.5" />
                        </span>
                      </span>
                    </div>
                    <div className="mt-2.5 text-sm font-medium text-content truncate">{a.title}</div>
                    <div className="text-xs text-muted truncate">
                      {a.artist_name ?? "Artista desconhecido"} · {a.track_count} faixas
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {view === "artists" && (
            artists.length === 0 ? (
              <EmptyState icon={<IconMusic size={22} />} title="Nenhum artista ainda"
                description="Os artistas são lidos das tags das músicas ao importar ou baixar." />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {artists.map((ar) => (
                  <button key={ar.id} onClick={() => { setQ(ar.name); setView("tracks"); }}
                    className="flex items-center gap-3 bg-panel border border-line/[.09] rounded-2xl px-4 py-3 hoverable hover:bg-panel2 text-left">
                    <span className="w-10 h-10 rounded-full brand-gradient text-white flex items-center justify-center font-semibold shrink-0">
                      {ar.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-content truncate">{ar.name}</span>
                      <span className="block text-xs text-muted">{ar.album_count} álbum(ns)</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          )}

          {view === "genres" && (
            genres.length === 0 ? (
              <EmptyState icon={<IconSparkle size={22} />} title="Nenhum gênero ainda"
                description="Preencha o gênero editando uma música para vê-la agrupada aqui." />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {genres.map((g) => (
                  <button key={g.name}
                    onClick={() => { setGenreFilter(g.name); setQ(""); setView("tracks"); }}
                    className="text-left bg-panel border border-line/[.09] rounded-2xl px-4 py-3.5 hoverable hover:bg-panel2">
                    <div className="text-sm text-content truncate">{g.name}</div>
                    <div className="text-xs text-muted mt-0.5">{g.count} faixa(s)</div>
                  </button>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Floating batch bar — appears only when there is a selection. */}
      {selectedTracks.length > 0 && (
        <div className="sticky bottom-2 z-30 mt-5 mx-auto w-fit max-w-full animate-fade-up">
          <div className="flex items-center gap-2 bg-elev border border-line/[.14] rounded-2xl shadow-lift px-3 py-2">
            <span className="text-sm px-2 whitespace-nowrap">
              <b>{selectedTracks.length}</b> selecionada(s)
              <span className="text-muted"> · {fmtTotal(selectedTracks.reduce((s, t) => s + (t.duration ?? 0), 0))}</span>
            </span>
            <span className="w-px h-6 bg-line/15" />
            <Button size="sm" onClick={() => setQueue(selectedTracks, 0)}><IconPlay size={13} /> Tocar</Button>
            <Button size="sm" variant="primary" onClick={() => setExporting(selectedTracks)}>
              <IconExport size={14} /> Exportar
            </Button>
            <Button size="sm" onClick={() => setEditing(selectedTracks)}><IconEdit size={14} /> Editar</Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(selectedTracks)}>
              <IconTrash size={14} /> Remover
            </Button>
            <IconButton label="Cancelar seleção" onClick={() => setSelected(new Set())}>✕</IconButton>
          </div>
        </div>
      )}

      {openAlbum && <AlbumModal album={openAlbum} onClose={() => setOpenAlbum(null)} onExport={setExporting} />}
      {editing && <TrackEditor tracks={editing} onClose={() => setEditing(null)} onSaved={() => { setSelected(new Set()); load(); }} />}
      {addingTo && <AddToPlaylist trackId={addingTo.id} onClose={() => setAddingTo(null)} />}
      {exporting && <ExportModal tracks={exporting} onClose={() => setExporting(null)} />}
      {confirmDelete && (
        <Modal
          title={confirmDelete.length === 1 ? "Remover da biblioteca?" : `Remover ${confirmDelete.length} músicas?`}
          onClose={() => setConfirmDelete(null)}
          width="w-[440px]"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => doDelete(confirmDelete)}>Remover</Button>
            </>
          }
        >
          <p className="text-sm text-muted leading-relaxed pb-2">
            {confirmDelete.length === 1 ? (
              <>“<span className="text-content">{confirmDelete[0].title}</span>” sai da sua biblioteca. </>
            ) : (
              <>Essas músicas saem da sua biblioteca. </>
            )}
            <b className="text-content">O arquivo continua no disco</b> — você pode importar de novo quando quiser.
          </p>
        </Modal>
      )}
    </div>
  );
}

/* ─────────────────────────── Track table ─────────────────────────── */

function TrackTable({
  tracks, selected, allSelected, playingId, isPlaying,
  onToggleOne, onToggleAll, onPlay, onEdit, onAdd, onExport, onDelete,
}: {
  tracks: Track[];
  selected: Set<number>;
  allSelected: boolean;
  playingId?: number;
  isPlaying: boolean;
  onToggleOne: (id: number) => void;
  onToggleAll: () => void;
  onPlay: (index: number) => void;
  onEdit: (t: Track) => void;
  onAdd: (t: Track) => void;
  onExport: (t: Track) => void;
  onDelete: (t: Track) => void;
}) {
  // Responsive: each optional column (Álbum, Gênero) is added to the grid track
  // list at the same breakpoint its cell becomes visible, so hidden columns
  // never leave an empty reserved gap that misaligns the row or crushes the
  // title. Fewer fixed pixels means the title keeps room even with the queue open.
  const cols =
    "grid-cols-[32px_1fr_56px_128px] lg:grid-cols-[32px_1fr_110px_56px_128px] xl:grid-cols-[32px_1fr_150px_110px_56px_128px]";
  return (
    <div className="bg-panel border border-line/[.09] rounded-2xl overflow-hidden">
      <div className={`grid ${cols} items-center gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted border-b divider`}>
        <div className="flex justify-center">
          <Checkbox
            checked={allSelected}
            indeterminate={!allSelected && selected.size > 0}
            onChange={onToggleAll}
            label="Selecionar todas"
          />
        </div>
        <div>Título</div>
        <div className="hidden xl:block">Álbum</div>
        <div className="hidden lg:block">Gênero</div>
        <div className="text-right">Duração</div>
        <div />
      </div>

      {tracks.map((t, i) => {
        const isCurrent = t.id === playingId;
        const isSel = selected.has(t.id);
        return (
          <div
            key={t.id}
            className={`group grid ${cols} items-center gap-3 px-4 py-2 border-b divider last:border-0 transition-colors
              ${isSel ? "bg-brand/[.08]" : "hover:bg-line/[.05]"}`}
          >
            <div className="flex justify-center">
              {/* Shows the playing indicator until the row is hovered, then the
                  checkbox — one column, both jobs, no extra clutter. */}
              {isCurrent && !isSel ? (
                <>
                  <span className="group-hover:hidden"><Equalizer playing={isPlaying} /></span>
                  <span className="hidden group-hover:inline-flex">
                    <Checkbox checked={isSel} onChange={() => onToggleOne(t.id)} label={`Selecionar ${t.title}`} />
                  </span>
                </>
              ) : (
                <Checkbox checked={isSel} onChange={() => onToggleOne(t.id)} label={`Selecionar ${t.title}`} />
              )}
            </div>

            <button onClick={() => onPlay(i)} title={`Tocar "${t.title}"`} className="flex items-center gap-3 min-w-0 text-left">
              <span className="w-9 h-9 rounded-lg overflow-hidden shrink-0 shadow-soft">
                <CoverArt path={t.cover_path} size="sm" />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm truncate ${isCurrent ? "text-brand font-medium" : "text-content"}`}>
                  {t.title}
                </span>
                <span className="block text-xs text-muted truncate">{artistOf(t)}</span>
              </span>
            </button>

            <div className="hidden xl:block text-xs text-muted truncate">{t.album_title ?? "—"}</div>
            <div className="hidden lg:block text-xs text-muted truncate">{t.genre ?? "—"}</div>
            <div className="text-xs text-muted text-right tabular-nums">{fmtDuration(t.duration)}</div>

            <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <IconButton label="Exportar para outra pasta" onClick={() => onExport(t)} className="w-8 h-8">
                <IconExport size={15} />
              </IconButton>
              <IconButton label="Editar informações" onClick={() => onEdit(t)} className="w-8 h-8">
                <IconEdit size={15} />
              </IconButton>
              <IconButton label="Adicionar a uma playlist" onClick={() => onAdd(t)} className="w-8 h-8">
                <IconPlus size={15} />
              </IconButton>
              <IconButton label="Remover da biblioteca" onClick={() => onDelete(t)} className="w-8 h-8 hover:text-danger">
                <IconTrash size={15} />
              </IconButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Album modal ─────────────────────────── */

function AlbumModal({
  album, onClose, onExport,
}: {
  album: AlbumCard;
  onClose: () => void;
  onExport: (tracks: Track[]) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [cover, setCover] = useState<string | null>(album.cover_path);
  const [enriching, setEnriching] = useState(false);
  const setQueue = usePlayerStore((s) => s.setQueue);

  useEffect(() => { api.albumTracks(album.id).then(setTracks).catch(() => setTracks([])); }, [album.id]);

  const enrich = async () => {
    setEnriching(true);
    try {
      const p = await api.enrichAlbum(album.id);
      if (p) { setCover(p); toast.success("Capa encontrada", "Buscada no MusicBrainz / Cover Art Archive."); }
      else toast.info("Nenhuma capa encontrada", "Tente editar o álbum e adicionar a capa manualmente.");
    } catch (e) {
      toast.error("A busca de capa falhou", String(e));
    } finally {
      setEnriching(false);
    }
  };

  const total = tracks.reduce((s, t) => s + (t.duration ?? 0), 0);

  return (
    <Modal
      title={album.title}
      subtitle={`${album.artist_name ?? "Artista desconhecido"}${album.year ? ` · ${album.year}` : ""}`}
      onClose={onClose}
      width="w-[600px]"
      footer={
        <>
          <Button variant="ghost" onClick={enrich} loading={enriching}>
            <IconSparkle size={15} /> Buscar capa
          </Button>
          <Button onClick={() => onExport(tracks)} disabled={tracks.length === 0}>
            <IconExport size={15} /> Exportar álbum
          </Button>
          <Button variant="primary" onClick={() => { setQueue(tracks, 0); onClose(); }} disabled={tracks.length === 0}>
            <IconPlay size={14} /> Tocar
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden shadow-soft"><CoverArt path={cover} /></div>
        <div className="text-sm text-muted">
          {tracks.length} {tracks.length === 1 ? "faixa" : "faixas"} · {fmtTotal(total)}
        </div>
      </div>

      <ol className="text-sm pb-2">
        {tracks.map((t, i) => (
          <li key={t.id}>
            <button onClick={() => { setQueue(tracks, i); onClose(); }} title={`Tocar "${t.title}"`}
              className="w-full flex items-center justify-between gap-3 py-2 px-2 rounded-lg hover:bg-line/[.06] text-left">
              <span className="min-w-0 flex items-center gap-3">
                <span className="text-muted text-xs w-5 tabular-nums">{t.track_no ?? i + 1}</span>
                <span className="truncate text-content/90">{t.title}</span>
              </span>
              <span className="text-muted text-xs tabular-nums shrink-0">{fmtDuration(t.duration)}</span>
            </button>
          </li>
        ))}
        {tracks.length === 0 && (
          <li className="text-muted text-sm py-4 flex items-center gap-2">
            <IconFolder size={15} /> Este álbum não tem faixas registradas.
          </li>
        )}
      </ol>
    </Modal>
  );
}
