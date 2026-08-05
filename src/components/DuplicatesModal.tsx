import { useEffect, useState } from "react";
import type { Track } from "../types";
import { api } from "../lib/ipc";
import { artistOf, fmtDuration } from "../lib/format";
import { toast } from "../store/useToastStore";
import { Button, Checkbox, EmptyState, Modal, Spinner } from "./ui";
import { IconCheck, IconTrash } from "./icons";

/** F5: group likely duplicates and let the user remove the extra copies.
 *  Nothing is pre-selected — deleting is always an explicit choice. */
export default function DuplicatesModal({ onClose }: { onClose: () => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    try { setTracks(await api.findDuplicates()); } catch { setTracks([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const groups = tracks.reduce<Record<string, Track[]>>((acc, t) => {
    const k = `${t.title?.toLowerCase()}|${Math.round(t.duration ?? 0)}`;
    (acc[k] ||= []).push(t);
    return acc;
  }, {});

  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** Convenience: keep the first copy of every group, tick all the rest. */
  const selectExtras = () =>
    setSel(new Set(Object.values(groups).flatMap((list) => list.slice(1).map((t) => t.id))));

  const remove = async () => {
    if (sel.size === 0) return;
    try {
      await api.deleteTracks([...sel]);
      toast.success(`${sel.size} cópia(s) removida(s) da biblioteca`, "Os arquivos continuam no disco.");
      setSel(new Set());
      load();
    } catch (e) {
      toast.error("Não foi possível remover", String(e));
    }
  };

  const groupList = Object.entries(groups);

  return (
    <Modal
      title="Músicas duplicadas"
      subtitle="Faixas com o mesmo título e a mesma duração. Marque as cópias que quiser tirar da biblioteca."
      onClose={onClose}
      width="w-[640px]"
      footer={
        <>
          {groupList.length > 0 && (
            <Button variant="ghost" onClick={selectExtras}>
              <IconCheck size={14} /> Marcar as cópias extras
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button variant="danger" onClick={remove} disabled={sel.size === 0}>
            <IconTrash size={14} /> Remover {sel.size > 0 ? `(${sel.size})` : ""}
          </Button>
        </>
      }
    >
      <div className="pb-2">
        {loading ? (
          <p className="text-sm text-muted flex items-center gap-2 py-6"><Spinner /> Procurando duplicatas…</p>
        ) : groupList.length === 0 ? (
          <EmptyState
            icon={<IconCheck size={22} />}
            title="Nenhuma duplicata encontrada"
            description="Sua biblioteca está limpa."
          />
        ) : (
          groupList.map(([k, list]) => (
            <div key={k} className="mb-4">
              <div className="text-sm text-content mb-1.5">
                {list[0].title}
                <span className="text-muted text-xs">
                  {" "}· {artistOf(list[0])} · {fmtDuration(list[0].duration)} · {list.length} cópias
                </span>
              </div>
              <div className="space-y-1">
                {list.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2.5 text-xs bg-panel2 rounded-lg px-3 py-2">
                    <Checkbox checked={sel.has(t.id)} onChange={() => toggle(t.id)} label={`Remover ${t.file_path}`} />
                    <span className="truncate text-muted flex-1" title={t.file_path}>{t.file_path}</span>
                    {i === 0 && <span className="text-[10px] text-success shrink-0">original</span>}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
