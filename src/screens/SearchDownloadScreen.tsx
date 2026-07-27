import { useEffect, useState } from "react";
import type { DestKind, SearchResult } from "../types";
import { useDownloadsStore } from "../store/useDownloadsStore";
import { api } from "../lib/ipc";
import { IconDownload, IconPlay, IconSearch } from "../components/icons";

// Extract an 11-char YouTube video id from the common URL shapes.
function youtubeId(s: string): string | null {
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:\S*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function fmtDur(sec: number | null): string {
  if (!sec || !isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// RF-09 (por link) + RF-10 (busca integrada + download direto para destino).
export default function SearchDownloadScreen() {
  const [input, setInput] = useState("");
  const [dest, setDest] = useState<DestKind>("library");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { jobs, init, start } = useDownloadsStore();

  useEffect(() => { init(); }, [init]);

  const urlId = youtubeId(input);
  const isUrl = urlId !== null || /^https?:\/\//i.test(input);
  const embedId = urlId ?? previewId;

  const doSearch = async () => {
    const q = input.trim();
    if (!q) return;
    setSearching(true); setSearchErr(""); setResults([]); setPreviewId(null);
    try {
      setResults(await api.youtubeSearch(q, 10));
    } catch (e) {
      setSearchErr(String(e));
    } finally {
      setSearching(false);
    }
  };

  const onSubmit = () => {
    if (!input.trim()) return;
    if (isUrl) start(input.trim(), dest);
    else doSearch();
  };

  const list = Object.values(jobs).sort((a, b) => b.id - a.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Buscar &amp; Baixar</h1>
      <p className="text-muted mb-6">
        Cole um link do YouTube <b>ou</b> pesquise pelo nome direto no app. Assista à prévia e baixe
        para o destino escolhido.
      </p>

      <div className="bg-panel rounded-xl p-4 space-y-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="Nome da música/artista, ou link do YouTube…"
            className="flex-1 bg-panel2 rounded-lg px-4 py-3 outline-none focus:ring-1 ring-brand"
          />
          <button onClick={onSubmit} disabled={searching}
            className="px-5 rounded-lg bg-white text-ink font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {isUrl ? <><IconDownload size={16} /> Baixar</> : <><IconSearch size={16} /> {searching ? "Buscando…" : "Buscar"}</>}
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted">Baixar direto para:</span>
          {(["library", "playlist", "album", "queue"] as DestKind[]).map((d) => (
            <button key={d} onClick={() => setDest(d)}
              className={`px-3 py-1.5 rounded-lg text-sm ${dest === d ? "bg-brand text-white" : "bg-panel2 text-muted hover:text-content"}`}>
              {d === "library" ? "Biblioteca" : d === "playlist" ? "Playlist" : d === "album" ? "Álbum" : "Fila"}
            </button>
          ))}
        </div>

        {/* Native preview: watch the clip (pasted URL or a picked result) */}
        {embedId && (
          <div className="rounded-xl overflow-hidden border border-white/10">
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
              <IconPlay size={16} />
              <span className="text-sm text-muted">Gostou? Baixe direto no app.</span>
              <button onClick={() => start(`https://www.youtube.com/watch?v=${embedId}`, dest)}
                className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium">
                <IconDownload size={16} /> Baixar esta música
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search results */}
      {searchErr && <p className="text-red-300 text-sm mt-4">{searchErr}</p>}
      {results.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-muted mb-2">Resultados</h2>
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-3 bg-panel rounded-lg p-2">
              <button onClick={() => setPreviewId(r.id)} title="Ver prévia" className="relative shrink-0">
                <img src={r.thumbnail} alt="" className="w-28 h-16 object-cover rounded-md" loading="lazy" />
                {r.duration ? <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 px-1 rounded">{fmtDur(r.duration)}</span> : null}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-content truncate">{r.title}</div>
                <div className="text-xs text-muted truncate">{r.uploader ?? ""}</div>
              </div>
              <button onClick={() => setPreviewId(r.id)} title="Prévia"
                className="text-muted hover:text-content px-2"><IconPlay size={16} /></button>
              <button onClick={() => start(`https://www.youtube.com/watch?v=${r.id}`, dest)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm shrink-0">
                <IconDownload size={15} /> Baixar
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold text-muted mt-8 mb-2">Downloads em andamento</h2>
      <div className="space-y-2">
        {list.length === 0 && <p className="text-muted text-sm">Nenhum download ainda.</p>}
        {list.map((j) => (
          <div key={j.id} className="bg-panel rounded-lg px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-content truncate mr-3">{j.input}</span>
              <span className={j.status === "error" ? "text-red-300" : j.status === "done" ? "text-brand" : "text-muted"}>
                {j.status === "done" ? "Concluído" : j.status === "error" ? "Erro" : `${Math.round(j.progress)}%`}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded bg-white/10 overflow-hidden">
              <div className="h-full bg-brand transition-all" style={{ width: `${j.status === "done" ? 100 : Math.max(2, j.progress)}%` }} />
            </div>
            {j.message && <div className={`mt-1 text-xs truncate ${j.status === "error" ? "text-red-300" : "text-muted"}`}>{j.message}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
