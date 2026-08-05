import { useEffect, useState } from "react";
import type { PlaylistCard, Track, PlaylistSort } from "../types";
import { api } from "../lib/ipc";
import { artistOf, fmtDuration, fmtTotal } from "../lib/format";
import { usePlayerStore } from "../store/usePlayerStore";
import { toast } from "../store/useToastStore";
import CoverArt from "../components/CoverArt";
import ExportModal from "../components/ExportModal";
import {
  Button, EmptyState, Equalizer, IconButton, Modal, PageHeader, Segmented,
} from "../components/ui";
import {
  IconPlay, IconChevronUp, IconChevronDown, IconClose, IconPlaylists, IconExport, IconTrash, IconPlus,
} from "../components/icons";

const SORTS: { value: PlaylistSort; label: string }[] = [
  { value: "custom", label: "Minha ordem" },
  { value: "recent", label: "Recentes" },
  { value: "alpha", label: "A–Z" },
  { value: "artist", label: "Artista" },
  { value: "year", label: "Ano" },
];

export default function PlaylistsScreen() {
  const [playlists, setPlaylists] = useState<PlaylistCard[]>([]);
  const [open, setOpen] = useState<PlaylistCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = () => api.listPlaylists().then(setPlaylists).catch(() => setPlaylists([]));
  useEffect(() => { load(); }, []);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.createPlaylist(name);
      toast.success("Playlist criada", name);
      setNewName(""); setCreating(false); load();
    } catch (e) {
      toast.error("Não foi possível criar", String(e));
    }
  };

  if (open) return <PlaylistDetail card={open} onBack={() => { setOpen(null); load(); }} />;

  return (
    <div className="pb-4">
      <PageHeader
        title="Playlists"
        subtitle="Monte suas próprias listas e exporte qualquer uma delas para o celular, o carro ou um pendrive."
        actions={<Button variant="primary" onClick={() => setCreating(true)}><IconPlus size={15} /> Nova playlist</Button>}
      />

      {playlists.length === 0 ? (
        <EmptyState
          icon={<IconPlaylists size={22} />}
          title="Nenhuma playlist ainda"
          description="Crie uma lista e vá juntando músicas pelo botão + da Biblioteca."
          action={<Button variant="primary" onClick={() => setCreating(true)}><IconPlus size={15} /> Criar a primeira</Button>}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-5">
          {playlists.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)}
              className="text-left group hoverable rounded-2xl p-2 -m-2 hover:bg-line/[.05]">
              <div className="aspect-square rounded-xl overflow-hidden shadow-soft relative">
                <CoverArt path={p.cover_path} />
                <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="w-11 h-11 rounded-full brand-gradient text-white flex items-center justify-center shadow-glow">
                    <IconPlay size={16} className="ml-0.5" />
                  </span>
                </span>
              </div>
              <div className="mt-2.5 text-sm font-medium text-content truncate">{p.name}</div>
              <div className="text-xs text-muted">{p.track_count} {p.track_count === 1 ? "faixa" : "faixas"}</div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <Modal
          title="Nova playlist"
          onClose={() => { setCreating(false); setNewName(""); }}
          width="w-[420px]"
          footer={
            <>
              <Button variant="ghost" onClick={() => { setCreating(false); setNewName(""); }}>Cancelar</Button>
              <Button variant="primary" onClick={create} disabled={!newName.trim()}>Criar</Button>
            </>
          }
        >
          <label className="block pb-2">
            <span className="text-xs font-medium text-muted">Nome da playlist</span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Ex.: Para a estrada"
              className="w-full mt-1.5 h-10 bg-panel2 border border-line/[.09] rounded-xl px-3 text-sm
                placeholder:text-muted/70 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/25"
            />
          </label>
        </Modal>
      )}
    </div>
  );
}

function PlaylistDetail({ card, onBack }: { card: PlaylistCard; onBack: () => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [sort, setSort] = useState<PlaylistSort>((card.sort_mode as PlaylistSort) || "custom");
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setQueue = usePlayerStore((s) => s.setQueue);
  const playing = usePlayerStore((s) => s.queue[s.currentIndex]);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

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

  const remove = async (tid: number) => {
    await api.removeFromPlaylist(card.id, tid);
    load();
  };

  const deletePlaylist = async () => {
    try {
      await api.deletePlaylist(card.id);
      toast.success("Playlist excluída", "As músicas continuam na sua biblioteca.");
      onBack();
    } catch (e) {
      toast.error("Não foi possível excluir", String(e));
    }
  };

  const total = tracks.reduce((s, t) => s + (t.duration ?? 0), 0);

  return (
    <div className="pb-4">
      <button onClick={onBack} className="text-sm text-muted hover:text-content mb-4 inline-flex items-center gap-1.5">
        ← Todas as playlists
      </button>

      <div className="flex items-center gap-5 mb-7">
        <div className="w-28 h-28 shrink-0 rounded-2xl overflow-hidden shadow-lift"><CoverArt path={card.cover_path} /></div>
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight truncate">{card.name}</h1>
          <div className="text-sm text-muted mt-1">
            {tracks.length} {tracks.length === 1 ? "faixa" : "faixas"}
            {total > 0 && ` · ${fmtTotal(total)}`}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <IconButton label="Excluir a playlist" onClick={() => setConfirmDelete(true)} className="hover:text-danger">
            <IconTrash size={16} />
          </IconButton>
          <Button onClick={() => setExporting(true)} disabled={tracks.length === 0}>
            <IconExport size={15} /> Exportar
          </Button>
          <Button variant="primary" onClick={() => tracks.length && setQueue(tracks, 0)} disabled={tracks.length === 0}>
            <IconPlay size={14} /> Tocar
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-muted">Ordenar por:</span>
        <Segmented value={sort} onChange={changeSort} options={SORTS} size="sm" />
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<IconPlaylists size={22} />}
          title="Playlist vazia"
          description="Adicione faixas pela Biblioteca — passe o mouse numa música e clique no +."
        />
      ) : (
        <div className="bg-panel border border-line/[.09] rounded-2xl overflow-hidden">
          {tracks.map((t, i) => {
            const isCurrent = t.id === playing?.id;
            return (
              <div key={`${t.id}-${i}`}
                className="group flex items-center gap-3 px-4 py-2 border-b divider last:border-0 hover:bg-line/[.05] transition-colors">
                <span className="w-6 shrink-0 flex justify-center">
                  {isCurrent ? <Equalizer playing={isPlaying} />
                    : <span className="text-xs text-muted tabular-nums">{i + 1}</span>}
                </span>

                <button onClick={() => setQueue(tracks, i)} title={`Tocar "${t.title}"`}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left">
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

                <span className="text-xs text-muted tabular-nums shrink-0">{fmtDuration(t.duration)}</span>

                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  {sort === "custom" && (
                    <>
                      <IconButton label="Mover para cima" onClick={() => move(i, -1)} className="w-8 h-8" disabled={i === 0}>
                        <IconChevronUp size={15} />
                      </IconButton>
                      <IconButton label="Mover para baixo" onClick={() => move(i, 1)} className="w-8 h-8" disabled={i === tracks.length - 1}>
                        <IconChevronDown size={15} />
                      </IconButton>
                    </>
                  )}
                  <IconButton label="Tirar da playlist" onClick={() => remove(t.id)} className="w-8 h-8 hover:text-danger">
                    <IconClose size={15} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {exporting && <ExportModal tracks={tracks} defaultName={card.name} onClose={() => setExporting(false)} />}
      {confirmDelete && (
        <Modal
          title={`Excluir a playlist “${card.name}”?`}
          onClose={() => setConfirmDelete(false)}
          width="w-[440px]"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
              <Button variant="danger" onClick={deletePlaylist}>Excluir</Button>
            </>
          }
        >
          <p className="text-sm text-muted leading-relaxed pb-2">
            Só a lista é apagada. <b className="text-content">As músicas continuam na sua biblioteca.</b>
          </p>
        </Modal>
      )}
    </div>
  );
}
