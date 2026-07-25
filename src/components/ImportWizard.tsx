import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/ipc";
import type { ImportSuggestion, ImportStrategy } from "../types";

type Phase = "idle" | "scanning" | "review" | "importing" | "done" | "error";

const STRATEGIES: { key: ImportStrategy; label: string; hint: string }[] = [
  { key: "follow", label: "Seguir as pastas", hint: "pasta-mãe = artista, subpastas = álbuns" },
  { key: "ignore_parent", label: "Ignorar a pasta-mãe", hint: "vincular a partir do nível seguinte" },
  { key: "tracks_only", label: "Extrair só as músicas", hint: "usar apenas as tags internas" },
];

export default function ImportWizard({ onImported }: { onImported: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sugg, setSugg] = useState<ImportSuggestion | null>(null);
  const [msg, setMsg] = useState("");
  const [count, setCount] = useState(0);

  const pickFolder = async () => {
    try {
      const path = await open({ directory: true, multiple: false });
      if (!path || typeof path !== "string") return;
      setPhase("scanning");
      const s = await api.scanFolder(path);
      setSugg(s);
      setPhase("review");
    } catch (e) {
      setMsg("Seleção de pasta requer o app Tauri (não funciona no preview do navegador).");
      setPhase("error");
    }
  };

  const confirm = async (strategy: ImportStrategy) => {
    if (!sugg) return;
    setPhase("importing");
    try {
      const paths = await api.listAudioFiles(sugg.root_path);
      const parsed = await api.parseFiles(paths);
      const n = await api.importWithStrategy(parsed, strategy);
      setCount(n);
      setPhase("done");
      onImported();
    } catch (e) {
      setMsg(String(e));
      setPhase("error");
    }
  };

  const reset = () => { setPhase("idle"); setSugg(null); setMsg(""); };

  return (
    <>
      <button onClick={pickFolder} className="px-4 py-2 rounded-lg bg-brand text-content text-sm">
        Importar pasta
      </button>

      {phase !== "idle" && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={reset}>
          <div className="bg-panel rounded-2xl p-6 w-[520px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Importar músicas</h2>

            {phase === "scanning" && <p className="text-muted">Analisando a pasta…</p>}

            {phase === "review" && sugg && (
              <div className="space-y-4">
                <div className="bg-panel2 rounded-lg p-4 text-sm">
                  <div className="text-content">{sugg.track_count} faixas encontradas</div>
                  <div className="text-muted mt-1">{sugg.message}</div>
                </div>
                <p className="text-sm text-muted">Como deseja importar?</p>
                <div className="space-y-2">
                  {STRATEGIES.map((st) => (
                    <button key={st.key} onClick={() => confirm(st.key)}
                      className="w-full text-left bg-panel2 hover:bg-white/10 rounded-lg px-4 py-3">
                      <div className="text-content">{st.label}</div>
                      <div className="text-xs text-muted">{st.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {phase === "importing" && <p className="text-muted">Importando e extraindo metadados…</p>}

            {phase === "done" && (
              <div className="space-y-4">
                <p className="text-content">{count} faixas importadas com sucesso.</p>
                <button onClick={reset} className="px-4 py-2 rounded-lg bg-brand text-content text-sm">Fechar</button>
              </div>
            )}

            {phase === "error" && (
              <div className="space-y-4">
                <p className="text-red-300 text-sm">{msg}</p>
                <button onClick={reset} className="px-4 py-2 rounded-lg bg-panel2 text-content text-sm">Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
