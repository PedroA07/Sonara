import { useEffect, useMemo, useState } from "react";
import type { DestKind, PlaylistCard, SearchResult } from "../types";
import { useDownloadsStore } from "../store/useDownloadsStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { api } from "../lib/ipc";
import { fmtDuration } from "../lib/format";
import {
  Badge, Button, EmptyState, IconButton, PageHeader, ProgressBar, Segmented, Spinner,
} from "../components/ui";
import {
  IconDownload, IconPlay, IconSearch, IconLink, IconClose, IconStop, IconAlert, IconFolder,
} from "../components/icons";

// Extract an 11-char YouTube video id from the common URL shapes.
function youtubeId(s: string): string | null {
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:\S*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

const DESTS: { value: DestKind; label: string }[] = [
  { value: "library", label: "Biblioteca" },
  { value: "playlist", label: "Uma playlist" },
  { value: "queue", label: "Tocar a seguir" },
];

/** RF-09 (by link) + RF-10 (integrated search and download to a destination). */
export default function SearchDownloadScreen({ onGoToDownloads }: { onGoToDownloads: () => void }) {
  const [input, setInput] = useState("");
  const [dest, setDest] = useState<DestKind>("library");
  const [playlists, setPlaylists] = useState<PlaylistCard[]>([]);
  const [playlistId, setPlaylistId] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { jobs, start, cancel } = useDownloadsStore();
  const audioFormat = useSettingsStore((s) => s.audioFormat);
  const downloadDir = useSettingsStore((s) => s.downloadDir);

  useEffect(() => {
    api.listPlaylists()
      .then((p) => { setPlaylists(p); setPlaylistId((id) => id ?? p[0]?.id ?? null); })
      .catch(() => setPlaylists([]));
  }, []);

  const urlId = youtubeId(input);
  const isUrl = urlId !== null || /^https?:\/\//i.test(input);
  const embedId = urlId ?? previewId;

  // A "playlist" destination without a chosen playlist used to silently drop
  // the track into the library. Now the button says why it is disabled.
  const destId = dest === "playlist" ? playlistId ?? undefined : undefined;
  const destBlocked = dest === "playlist" && !playlistId;

  const doSearch = async () => {
    const q = input.trim();
    if (!q) return;
    setSearching(true); setSearchErr(""); setResults([]); setPreviewId(null);
    try {
      setResults(await api.youtubeSearch(q, 12));
      setSearched(true);
    } catch (e) {
      setSearchErr(String(e));
    } finally {
      setSearching(false);
    }
  };

  const download = (url: string, label?: string) => start(url, dest, destId, label);

  const onSubmit = () => {
    if (!input.trim()) return;
    if (isUrl) download(input.trim());
    else doSearch();
  };

  const live = useMemo(
    () => Object.values(jobs).sort((a, b) => b.id - a.id).slice(0, 4),
    [jobs]
  );

  return (
    <div className="max-w-4xl pb-4">
      <PageHeader
        title="Buscar & Baixar"
        subtitle="Pesquise pelo nome ou cole um link do YouTube. Ouça a prévia e baixe direto para onde você quiser."
      />

      {/* ── Step 1: what to download ───────────────────────────────── */}
      <div className="bg-panel border border-line/[.09] rounded-2xl p-4 shadow-soft space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
              {isUrl ? <IconLink size={16} /> : <IconSearch size={16} />}
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder="Nome da música ou artista — ou cole um link do YouTube"
              aria-label="Nome da música ou link"
              className="w-full h-12 pl-10 pr-10 bg-panel2 border border-line/[.09] rounded-xl text-sm
                placeholder:text-muted/70 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/25"
            />
            {input && (
              <button
                onClick={() => { setInput(""); setResults([]); setSearched(false); setPreviewId(null); }}
                aria-label="Limpar"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-content"
              >
                <IconClose size={15} />
              </button>
            )}
          </div>
          <Button variant="primary" size="lg" onClick={onSubmit} loading={searching} disabled={!input.trim() || destBlocked}>
            {isUrl ? <><IconDownload size={17} /> Baixar</> : <><IconSearch size={17} /> Buscar</>}
          </Button>
        </div>

        {/* ── Step 2: where it lands ───────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span className="text-xs text-muted">Depois de baixar, colocar em:</span>
          <Segmented value={dest} onChange={setDest} options={DESTS} size="sm" />

          {dest === "playlist" && (
            playlists.length > 0 ? (
              <select
                value={playlistId ?? ""}
                onChange={(e) => setPlaylistId(Number(e.target.value))}
                aria-label="Escolha a playlist"
                className="h-8 px-3 bg-panel2 border border-line/[.09] rounded-lg text-xs text-content outline-none
                  focus:border-brand/60 focus:ring-2 focus:ring-brand/25"
              >
                {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-warn">
                <IconAlert size={13} /> Crie uma playlist primeiro na aba Playlists.
              </span>
            )
          )}

          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted" title={downloadDir}>
            <IconFolder size={13} />
            <span className="max-w-[220px] truncate">{downloadDir || "pasta padrão"}</span>
            <Badge>{audioFormat.toUpperCase()}</Badge>
          </span>
        </div>

        {/* Preview of the pasted link or of a picked result. */}
        {embedId && (
          <div className="rounded-xl overflow-hidden border border-line/[.12] animate-scale-in">
            <div className="relative w-full bg-black" style={{ paddingTop: "56.25%" }}>
              <iframe
                key={embedId}
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${embedId}`}
                title="Prévia do clipe"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="flex items-center gap-3 bg-panel2 px-4 py-3">
              <span className="text-xs text-muted">É essa? Baixe o áudio dela.</span>
              <Button
                variant="primary" size="sm" className="ml-auto" disabled={destBlocked}
                onClick={() => download(`https://www.youtube.com/watch?v=${embedId}`)}
              >
                <IconDownload size={14} /> Baixar esta música
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Live downloads (compact; the full list lives in Downloads) ── */}
      {live.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold">Baixando agora</h2>
            <button onClick={onGoToDownloads} className="text-xs text-brand hover:underline ml-auto">
              Ver todos os downloads
            </button>
          </div>
          <div className="space-y-2">
            {live.map((j) => (
              <div key={j.id} className="bg-panel border border-line/[.09] rounded-xl px-4 py-3 animate-fade-in">
                <div className="flex items-center gap-3 text-sm">
                  <span className="truncate text-content">{j.title || j.input}</span>
                  <span className={`ml-auto text-xs shrink-0 tabular-nums ${
                    j.status === "error" ? "text-danger" :
                    j.status === "done" ? "text-success" :
                    j.status === "canceled" ? "text-muted" : "text-muted"
                  }`}>
                    {j.status === "done" ? "Concluído"
                      : j.status === "error" ? "Erro"
                      : j.status === "canceled" ? "Cancelado"
                      : `${Math.round(j.progress)}%`}
                  </span>
                  {j.status === "running" && (
                    <IconButton label="Cancelar download" onClick={() => cancel(j.id)} className="w-7 h-7 -mr-1">
                      <IconStop size={12} />
                    </IconButton>
                  )}
                </div>
                {j.status === "running" && (
                  <>
                    <ProgressBar className="mt-2" value={j.progress} indeterminate={j.progress >= 99.5} />
                    <div className="mt-1 text-[11px] text-muted flex gap-3">
                      {j.speed && <span>{j.speed}</span>}
                      {j.eta && <span>faltam {j.eta}</span>}
                      {j.message && <span className="truncate">{j.message}</span>}
                    </div>
                  </>
                )}
                {j.status === "error" && j.message && (
                  <div className="mt-1 text-[11px] text-danger break-words">{j.message}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      {searchErr && (
        <div className="mt-6 flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-4 py-3">
          <IconAlert size={16} className="mt-0.5 shrink-0" />
          <span className="break-words">{searchErr}</span>
        </div>
      )}

      {searching && (
        <div className="mt-8 flex items-center justify-center gap-2 text-muted text-sm">
          <Spinner /> Procurando no YouTube…
        </div>
      )}

      {!searching && results.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold mb-3">
            Resultados <span className="text-muted font-normal">({results.length})</span>
          </h2>
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.id}
                className="flex items-center gap-3 bg-panel border border-line/[.09] rounded-xl p-2 hoverable hover:bg-panel2">
                <button onClick={() => setPreviewId(r.id)} title="Ver a prévia" className="relative shrink-0 group">
                  <img src={r.thumbnail} alt="" loading="lazy" className="w-28 h-16 object-cover rounded-lg" />
                  <span className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <IconPlay size={18} />
                  </span>
                  {r.duration ? (
                    <span className="absolute bottom-1 right-1 text-[10px] bg-black/75 text-white px-1.5 py-0.5 rounded tabular-nums">
                      {fmtDuration(r.duration)}
                    </span>
                  ) : null}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-content line-clamp-2">{r.title}</div>
                  <div className="text-xs text-muted truncate mt-0.5">{r.uploader ?? ""}</div>
                </div>
                <Button
                  variant="primary" size="sm" className="shrink-0" disabled={destBlocked}
                  onClick={() => download(`https://www.youtube.com/watch?v=${r.id}`, r.title)}
                >
                  <IconDownload size={14} /> Baixar
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!searching && searched && results.length === 0 && !searchErr && (
        <div className="mt-6">
          <EmptyState
            icon={<IconSearch size={22} />}
            title="Nenhum resultado"
            description="Tente escrever o nome do artista junto com o da música."
          />
        </div>
      )}

      {!searched && results.length === 0 && !input && live.length === 0 && (
        <div className="mt-8 grid sm:grid-cols-3 gap-3">
          <Hint n="1" title="Pesquise" text="Digite o nome da música ou do artista e toque em Buscar." />
          <Hint n="2" title="Confira" text="Clique na miniatura para ouvir a prévia antes de baixar." />
          <Hint n="3" title="Baixe" text="A música entra na sua biblioteca já com capa e informações." />
        </div>
      )}
    </div>
  );
}

function Hint({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="bg-panel border border-line/[.09] rounded-2xl p-4">
      <span className="w-7 h-7 rounded-full brand-gradient text-white text-xs font-bold flex items-center justify-center mb-2.5">
        {n}
      </span>
      <div className="text-sm font-medium text-content">{title}</div>
      <div className="text-xs text-muted mt-1 leading-relaxed">{text}</div>
    </div>
  );
}
