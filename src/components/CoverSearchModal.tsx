import { useEffect, useState } from "react";
import type { CoverCandidate } from "../types";
import { api } from "../lib/ipc";
import { toast } from "../store/useToastStore";
import { Button, Modal, Spinner } from "./ui";
import { IconSearch } from "./icons";

/** RF-05: search album artwork online and let the user preview and pick a cover.
 *  Applies the chosen image to `trackId` (downloads it via the backend). */
export default function CoverSearchModal({
  trackId, initialQuery, writeFile, onClose, onApplied,
}: {
  trackId: number;
  initialQuery: string;
  writeFile: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CoverCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const run = async (q: string) => {
    const term = q.trim();
    if (!term) return;
    setLoading(true); setErr(""); setResults([]);
    try {
      const r = await api.searchCoverArt(term, 18);
      setResults(r);
      if (r.length === 0) setErr("Nenhuma capa encontrada. Tente outro termo (ex.: artista + álbum).");
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Search once with whatever the editor already knows about the track.
  useEffect(() => { run(initialQuery); /* eslint-disable-next-line */ }, []);

  const pick = async (c: CoverCandidate) => {
    setApplying(c.full); setErr("");
    try {
      await api.setCoverFromUrl(trackId, c.full, writeFile);
      toast.success("Capa atualizada");
      onApplied();
      onClose();
    } catch (e) {
      setErr(String(e));
      setApplying(null);
    }
  };

  return (
    <Modal
      title="Buscar capa"
      subtitle="Imagens de referência da busca. Clique numa para usar como capa."
      onClose={onClose}
      width="w-[600px]"
    >
      <div className="pb-2">
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run(query)}
              placeholder="Artista e álbum…"
              aria-label="Buscar capa"
              className="w-full h-10 pl-9 pr-3 bg-panel2 border border-line/[.09] rounded-xl text-sm
                placeholder:text-muted/70 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/25"
            />
          </div>
          <Button variant="primary" onClick={() => run(query)} loading={loading}>Buscar</Button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-muted text-sm py-10 justify-center">
            <Spinner /> Procurando capas…
          </div>
        )}

        {err && <p className="text-danger text-sm mb-3">{err}</p>}

        {results.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 max-h-[46vh] overflow-y-auto pr-1">
            {results.map((c) => (
              <button
                key={c.full}
                onClick={() => pick(c)}
                disabled={applying !== null}
                title={c.label || "Usar esta capa"}
                className="group relative aspect-square rounded-xl overflow-hidden border border-line/[.1]
                  hover:border-brand/60 focus-visible:border-brand transition disabled:opacity-60"
              >
                <img src={c.thumb} alt={c.label} loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity
                  flex items-center justify-center text-white text-xs font-medium">
                  {applying === c.full ? <Spinner /> : "Usar esta"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
