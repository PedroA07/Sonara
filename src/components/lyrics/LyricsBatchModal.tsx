import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LyricsBatchProgress, Track } from "../../types";
import { api } from "../../lib/ipc";
import { useSettingsStore } from "../../store/useSettingsStore";
import { toast } from "../../store/useToastStore";
import { Button, Modal, ProgressBar } from "../ui";
import { IconAlert, IconCheck, IconSearch, IconStop, IconText } from "../icons";

type Phase = "ask" | "running" | "done";

/**
 * Busca de letra para várias faixas de uma vez.
 *
 * A busca online é opt-in, então o passo "ask" não é burocracia: quando ela
 * está desligada, a pessoa escolhe entre ligá-la ou rodar só o que é local
 * (letra embutida no arquivo e `.lrc` ao lado). Nas duas situações fica claro
 * o que vai sair — ou não sair — do computador.
 */
export default function LyricsBatchModal({
  tracks,
  onClose,
}: {
  tracks: Track[];
  onClose: () => void;
}) {
  const providerEnabled = useSettingsStore((s) => s.lyricsProviderEnabled);
  const setProviderEnabled = useSettingsStore((s) => s.setLyricsProviderEnabled);

  const [phase, setPhase] = useState<Phase>("ask");
  const [online, setOnline] = useState(providerEnabled);
  const [progress, setProgress] = useState<LyricsBatchProgress | null>(null);
  const [err, setErr] = useState("");
  const unlisten = useRef<null | (() => void)>(null);

  useEffect(() => () => { unlisten.current?.(); }, []);

  const start = async (withNetwork: boolean) => {
    setErr("");
    setOnline(withNetwork);
    // A opção precisa estar gravada *antes* do comando: é o banco, não este
    // componente, que autoriza o core a tocar a rede.
    if (withNetwork && !providerEnabled) setProviderEnabled(true);

    // O ouvinte vem antes do invoke, senão os primeiros eventos se perdem.
    try {
      unlisten.current = await listen<LyricsBatchProgress>("lyrics-batch-progress", (e) =>
        setProgress(e.payload)
      );
    } catch { /* preview no navegador: sem eventos, o resultado final basta */ }

    setPhase("running");
    setProgress({ done: 0, total: tracks.length, found: 0, title: "", finished: false });
    try {
      const found = await api.lyricsFetchBatch(tracks.map((t) => t.id));
      setProgress((p) => ({
        done: p?.done ?? tracks.length, total: tracks.length, found, title: "", finished: true,
      }));
      setPhase("done");
    } catch (e) {
      setErr(String(e));
      setPhase("done");
    } finally {
      unlisten.current?.();
      unlisten.current = null;
    }
  };

  const cancel = () => {
    api.lyricsCancelBatch().catch(() => {});
    toast.info("Parando…", "As faixas em andamento terminam antes de a busca parar.");
  };

  const total = tracks.length;
  const done = progress?.done ?? 0;
  const found = progress?.found ?? 0;
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <Modal
      title={`Buscar letras de ${total} ${total === 1 ? "música" : "músicas"}`}
      subtitle={
        phase === "running"
          ? "Pode fechar depois — a busca continua rodando."
          : "O Sonara procura primeiro dentro dos próprios arquivos."
      }
      onClose={phase === "running" ? () => {} : onClose}
      width="w-[520px]"
      footer={
        phase === "ask" ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            {!providerEnabled && (
              <Button onClick={() => start(false)}>Só nos arquivos</Button>
            )}
            <Button variant="primary" onClick={() => start(true)}>
              <IconSearch size={15} /> {providerEnabled ? "Buscar" : "Ligar busca online e buscar"}
            </Button>
          </>
        ) : phase === "running" ? (
          <Button variant="danger" onClick={cancel}><IconStop size={14} /> Parar</Button>
        ) : (
          <Button variant="primary" onClick={onClose}>Fechar</Button>
        )
      }
    >
      <div className="space-y-4 pb-2">
        {phase === "ask" && (
          <>
            <div className="flex gap-3 items-start bg-panel2 border border-line/[.08] rounded-xl px-3.5 py-3">
              <IconText size={17} className="text-brand mt-0.5 shrink-0" />
              <p className="text-sm text-muted leading-relaxed">
                Letras já gravadas dentro do arquivo, ou num <code className="text-content/80">.lrc</code> ao
                lado dele, são lidas sem internet. {providerEnabled
                  ? "O que faltar é procurado no LRCLIB."
                  : "Para procurar o que faltar, o Sonara precisa consultar o LRCLIB."}
              </p>
            </div>
            {!providerEnabled && (
              <p className="text-[11px] text-muted/80 leading-relaxed">
                A busca online envia apenas o nome da música, o artista e a duração. Ligando aqui, ela também
                fica ligada em Configurações — você pode desligar quando quiser.
              </p>
            )}
          </>
        )}

        {phase !== "ask" && (
          <>
            <ProgressBar value={pct} />
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted tabular-nums">{done} de {total}</span>
              <span className="text-content">
                <b className="text-brand">{found}</b> {found === 1 ? "letra encontrada" : "letras encontradas"}
              </span>
            </div>
            {phase === "running" && (
              <p className="text-xs text-muted truncate min-h-[1rem]">{progress?.title ?? ""}</p>
            )}
            {phase === "done" && !err && (
              <p className="text-sm text-content flex items-start gap-2">
                <IconCheck size={15} className="text-success mt-0.5 shrink-0" />
                {found === 0
                  ? online
                    ? "Nenhuma letra encontrada para essas músicas."
                    : "Nenhuma dessas músicas trazia letra no arquivo. Ligue a busca online para procurar fora."
                  : `Pronto. As letras aparecem ao tocar cada música.`}
              </p>
            )}
            {err && (
              <p className="text-danger text-sm flex items-start gap-2">
                <IconAlert size={15} className="mt-0.5 shrink-0" /> {err}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
