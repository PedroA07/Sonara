import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/ipc";
import type { ImportSuggestion, ImportStrategy } from "../types";
import { toast } from "../store/useToastStore";
import { Button, Modal, Spinner } from "./ui";
import { IconFolder, IconCheck, IconAlert } from "./icons";

type Phase = "idle" | "scanning" | "review" | "importing" | "done" | "error";

const STRATEGIES: { key: ImportStrategy; label: string; hint: string }[] = [
  { key: "follow", label: "Seguir a organização das pastas", hint: "A pasta de cima vira o artista e cada subpasta vira um álbum." },
  { key: "ignore_parent", label: "Ignorar a pasta de cima", hint: "O artista vem das tags; cada subpasta vira um álbum." },
  { key: "tracks_only", label: "Usar só as informações dos arquivos", hint: "Ignora os nomes das pastas e lê apenas as tags." },
];

/** Guided folder import: pick → see what was found → choose how to organise. */
export default function ImportWizard({ onImported }: { onImported: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sugg, setSugg] = useState<ImportSuggestion | null>(null);
  const [msg, setMsg] = useState("");
  const [count, setCount] = useState(0);

  const pickFolder = async () => {
    try {
      const path = await open({ directory: true, multiple: false, title: "Escolha a pasta com suas músicas" });
      if (!path || typeof path !== "string") return;
      setPhase("scanning");
      setSugg(await api.scanFolder(path));
      setPhase("review");
    } catch {
      setMsg("Não foi possível abrir o seletor de pastas. Este recurso só funciona no aplicativo instalado.");
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
      toast.success(
        n === 1 ? "1 música importada" : `${n} músicas importadas`,
        "Já estão na sua biblioteca."
      );
    } catch (e) {
      setMsg(String(e));
      setPhase("error");
    }
  };

  const reset = () => { setPhase("idle"); setSugg(null); setMsg(""); };

  return (
    <>
      <Button onClick={pickFolder}><IconFolder size={15} /> Importar pasta</Button>

      {phase !== "idle" && (
        <Modal
          title="Importar músicas do computador"
          subtitle="Os arquivos continuam onde estão — o Sonara apenas passa a conhecê-los."
          onClose={phase === "scanning" || phase === "importing" ? () => {} : reset}
          width="w-[540px]"
          footer={
            phase === "done" || phase === "error" ? <Button variant="primary" onClick={reset}>Fechar</Button> : undefined
          }
        >
          <div className="pb-3">
            {phase === "scanning" && (
              <p className="text-sm text-muted flex items-center gap-2 py-6"><Spinner /> Analisando a pasta…</p>
            )}

            {phase === "review" && sugg && (
              <div className="space-y-4">
                <div className="bg-panel2 rounded-xl px-4 py-3.5 text-sm">
                  <div className="text-content font-medium">
                    {sugg.track_count} {sugg.track_count === 1 ? "música encontrada" : "músicas encontradas"}
                  </div>
                  <div className="text-muted text-xs mt-1">{sugg.message}</div>
                  <div className="text-muted/70 text-[11px] mt-1.5 break-all">{sugg.root_path}</div>
                </div>
                <p className="text-sm text-content">Como você quer organizá-las?</p>
                <div className="space-y-2">
                  {STRATEGIES.map((st) => (
                    <button
                      key={st.key}
                      onClick={() => confirm(st.key)}
                      className="w-full text-left bg-panel2 hover:bg-elev border border-line/[.08] hover:border-brand/40
                        rounded-xl px-4 py-3 transition-colors"
                    >
                      <div className="text-sm text-content">{st.label}</div>
                      <div className="text-xs text-muted mt-0.5">{st.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {phase === "importing" && (
              <p className="text-sm text-muted flex items-center gap-2 py-6">
                <Spinner /> Importando e lendo as informações de cada arquivo…
              </p>
            )}

            {phase === "done" && (
              <div className="flex items-start gap-3 py-4">
                <span className="w-9 h-9 rounded-xl bg-success/15 text-success flex items-center justify-center shrink-0">
                  <IconCheck size={17} />
                </span>
                <p className="text-sm text-content">
                  {count === 1 ? "1 música importada." : `${count} músicas importadas.`}
                  <span className="block text-muted text-xs mt-1">
                    Faixas que já estavam na biblioteca não foram duplicadas.
                  </span>
                </p>
              </div>
            )}

            {phase === "error" && (
              <div className="flex items-start gap-3 py-4">
                <span className="w-9 h-9 rounded-xl bg-danger/15 text-danger flex items-center justify-center shrink-0">
                  <IconAlert size={17} />
                </span>
                <p className="text-sm text-danger break-words">{msg}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
