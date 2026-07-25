import { useEffect, useState } from "react";
import type { Track } from "../types";
import { api } from "../lib/ipc";

// F5: group likely duplicates and let the user delete extras.
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
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const remove = async () => {
    if (sel.size === 0) return;
    await api.deleteTracks([...sel]);
    setSel(new Set());
    load();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel rounded-2xl p-6 w-[620px] max-w-[92vw] max-h-[82vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Duplicatas</h2>
          <button onClick={remove} disabled={sel.size === 0}
            className="px-4 py-2 rounded-lg bg-brand text-white text-sm disabled:opacity-40">
            Excluir selecionadas ({sel.size})
          </button>
        </div>
        {loading ? <p className="text-muted">Procurando…</p> :
          Object.keys(groups).length === 0 ? <p className="text-muted">Nenhuma duplicata encontrada.</p> :
          Object.entries(groups).map(([k, list]) => (
            <div key={k} className="mb-4">
              <div className="text-sm text-content mb-1">{list[0].title} <span className="text-muted">· {Math.round(list[0].duration ?? 0)}s · {list.length} cópias</span></div>
              <div className="space-y-1">
                {list.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-xs text-muted bg-panel2 rounded px-3 py-2">
                    <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} className="accent-brand" />
                    <span className="truncate">{t.file_path}</span>
                  </label>
                ))}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
