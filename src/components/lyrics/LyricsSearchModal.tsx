import { useEffect, useState } from "react";
import type { LyricsCandidate } from "../../types";
import { api } from "../../lib/ipc";
import { fmtDuration } from "../../lib/format";
import { useLyricsStore } from "../../store/useLyricsStore";
import { toast } from "../../store/useToastStore";
import { Badge, Button, EmptyState, Modal, Spinner, TextField } from "../ui";
import { IconAlert, IconMusic, IconSearch } from "../icons";

/**
 * Busca manual de letra.
 *
 * Existe porque a busca automática só aplica um resultado quando a duração
 * confirma que é a mesma gravação. Quando não confirma — versão ao vivo,
 * remaster, faixa sem duração registrada — a escolha volta para a pessoa, que
 * vê título, artista e duração antes de decidir.
 */
export default function LyricsSearchModal({
  trackId,
  initialQuery,
  onClose,
}: {
  trackId: number;
  initialQuery: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<LyricsCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const run = async (q: string) => {
    if (!q.trim()) return;
    setSearching(true); setErr(""); setResults([]);
    try {
      setResults(await api.lyricsSearch(q));
      setSearched(true);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSearching(false);
    }
  };

  // Primeira busca automática com o que já se sabe da faixa.
  useEffect(() => { run(initialQuery); /* eslint-disable-next-line */ }, []);

  const apply = async (c: LyricsCandidate) => {
    setApplying(c.providerId); setErr("");
    try {
      const lyrics = await api.lyricsApplyCandidate(trackId, query, c.providerId);
      useLyricsStore.setState({ lyrics, status: "ready" });
      toast.success("Letra aplicada", `${c.trackName} — ${c.artistName}`);
      onClose();
    } catch (e) {
      setErr(String(e));
      setApplying(null);
    }
  };

  return (
    <Modal
      title="Procurar letra"
      subtitle="Ajuste o nome da música e do artista se precisar, e escolha o resultado certo."
      onClose={onClose}
      width="w-[620px]"
      footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}
    >
      <div className="space-y-3 pb-2">
        <div className="flex items-end gap-2">
          <TextField
            label="Música e artista"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run(query)}
            className="flex-1"
          />
          <Button onClick={() => run(query)} loading={searching}>
            <IconSearch size={15} /> Buscar
          </Button>
        </div>

        {err && (
          <p className="text-danger text-xs flex items-start gap-1.5">
            <IconAlert size={13} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}

        {searching && (
          <p className="text-sm text-muted flex items-center gap-2 py-6 justify-center">
            <Spinner /> Procurando…
          </p>
        )}

        {!searching && results.length > 0 && (
          <div className="space-y-1.5 max-h-[46vh] overflow-y-auto -mx-1 px-1">
            {results.map((c) => (
              <div
                key={c.providerId}
                className="flex items-center gap-3 bg-panel2 border border-line/[.08] rounded-xl px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-content truncate">{c.trackName}</div>
                  <div className="text-xs text-muted truncate">
                    {c.artistName}
                    {c.albumName ? ` · ${c.albumName}` : ""}
                    {c.durationSec > 0 ? ` · ${fmtDuration(c.durationSec)}` : ""}
                  </div>
                </div>
                {c.instrumental ? (
                  <Badge>instrumental</Badge>
                ) : c.hasSynced ? (
                  <Badge tone="success">sincronizada</Badge>
                ) : (
                  <Badge tone="warn">sem sincronia</Badge>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => apply(c)}
                  loading={applying === c.providerId}
                  disabled={applying !== null}
                >
                  Usar
                </Button>
              </div>
            ))}
          </div>
        )}

        {!searching && searched && results.length === 0 && !err && (
          <EmptyState
            icon={<IconMusic size={22} />}
            title="Nenhum resultado"
            description="Tente escrever só o nome da música, ou só o artista."
          />
        )}

        <p className="text-[11px] text-muted/80 pt-1">
          Resultados fornecidos pelo LRCLIB. A letra é gravada só no seu computador.
        </p>
      </div>
    </Modal>
  );
}
