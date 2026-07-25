import { useEffect, useState } from "react";
import type { DestKind } from "../types";
import { useDownloadsStore } from "../store/useDownloadsStore";

// RF-09 (por link) + RF-10 (busca integrada + download direto para destino).
export default function SearchDownloadScreen() {
  const [input, setInput] = useState("");
  const [dest, setDest] = useState<DestKind>("library");
  const { jobs, init, start } = useDownloadsStore();

  useEffect(() => { init(); }, [init]);

  const submit = async () => {
    if (!input.trim()) return;
    await start(input.trim(), dest);
    setInput("");
  };

  const list = Object.values(jobs).sort((a, b) => b.id - a.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Buscar &amp; Baixar</h1>
      <p className="text-muted mb-6">
        Cole um link do YouTube (vídeo ou playlist) ou digite o nome de uma música.
        Escolha o destino e a faixa é baixada e já entra organizada.
      </p>

      <div className="bg-panel rounded-xl p-4 space-y-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Link ou termo de busca…"
          className="w-full bg-panel2 rounded-lg px-4 py-3 outline-none focus:ring-1 ring-brand"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted">Baixar direto para:</span>
          {(["library", "playlist", "album", "queue"] as DestKind[]).map((d) => (
            <button key={d} onClick={() => setDest(d)}
              className={`px-3 py-1.5 rounded-lg text-sm ${dest === d ? "bg-brand text-white" : "bg-panel2 text-muted hover:text-content"}`}>
              {d === "library" ? "Biblioteca" : d === "playlist" ? "Playlist" : d === "album" ? "Álbum" : "Fila"}
            </button>
          ))}
          <button onClick={submit} className="ml-auto px-5 py-2 rounded-lg bg-white text-ink font-medium">Baixar</button>
        </div>
      </div>

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
            {j.message && <div className="mt-1 text-xs text-muted truncate">{j.message}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
