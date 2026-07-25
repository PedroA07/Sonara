import { useEffect, useState } from "react";
import type { DownloadJob } from "../types";
import { api } from "../lib/ipc";
import { useDownloadsStore } from "../store/useDownloadsStore";

// RF-09/10: history + staging of downloads. Live jobs come from the store,
// past jobs from the backend.
export default function DownloadsScreen() {
  const [past, setPast] = useState<DownloadJob[]>([]);
  const live = useDownloadsStore((s) => s.jobs);

  useEffect(() => { api.listDownloadJobs().then(setPast).catch(() => setPast([])); }, [live]);

  const destLabel = (k: string | null) =>
    k === "playlist" ? "Playlist" : k === "album" ? "Álbum" : k === "queue" ? "Fila" : "Biblioteca";

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Downloads</h1>
      <p className="text-muted mb-6">
        Faixas baixadas do YouTube. Já entram organizadas no destino escolhido; edite metadados/capa
        pela Biblioteca ou mova para outras playlists.
      </p>

      {past.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-muted">
          Nenhum download ainda. Baixe algo em "Buscar &amp; Baixar".
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-muted text-left border-b border-white/10">
            <tr><th className="py-2">Entrada</th><th>Tipo</th><th>Destino</th><th className="text-right">Status</th></tr>
          </thead>
          <tbody>
            {past.map((j) => (
              <tr key={j.id} className="border-b border-white/5">
                <td className="py-2 text-content truncate max-w-xs">{j.url}</td>
                <td className="text-muted">{j.type}</td>
                <td className="text-muted">{destLabel(j.dest_kind)}</td>
                <td className="text-right">
                  <span className={j.status === "error" ? "text-red-300" : j.status === "done" ? "text-brand" : "text-muted"}>
                    {j.status === "done" ? "Concluído" : j.status === "error" ? "Erro" : `${Math.round(j.progress)}%`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
