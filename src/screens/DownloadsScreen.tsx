import { useCallback, useEffect, useMemo, useState } from "react";
import type { DestKind, DownloadJob, JobStatus, Track } from "../types";
import { api } from "../lib/ipc";
import { fmtDate } from "../lib/format";
import { useDownloadsStore } from "../store/useDownloadsStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { usePlayerStore } from "../store/usePlayerStore";
import { toast } from "../store/useToastStore";
import ExportModal from "../components/ExportModal";
import LyricsBadge from "../components/lyrics/LyricsBadge";
import { useLyricsStatus } from "../hooks/useLyricsStatus";
import {
  Badge, Button, EmptyState, IconButton, Modal, PageHeader, ProgressBar, Segmented,
} from "../components/ui";
import {
  IconDownload, IconPlay, IconStop, IconFolder, IconRefresh, IconExport, IconTrash, IconAlert, IconCheck,
} from "../components/icons";

type Filter = "all" | "running" | "done" | "error";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "running", label: "Em andamento" },
  { value: "done", label: "Concluídos" },
  { value: "error", label: "Com erro" },
];

/** The DB stores dest_kind as free text; narrow it back for the retry call. */
function destKindOf(v: string | null): DestKind {
  return v === "playlist" || v === "album" || v === "queue" ? v : "library";
}

const STATUS: Record<JobStatus, { label: string; tone: "brand" | "success" | "danger" | "muted" }> = {
  running: { label: "Baixando", tone: "brand" },
  pending: { label: "Na fila", tone: "muted" },
  done: { label: "Concluído", tone: "success" },
  error: { label: "Erro", tone: "danger" },
  canceled: { label: "Cancelado", tone: "muted" },
};

/** RF-09/10: what is downloading right now plus the full history, with the
 *  actions people actually want next — tocar, abrir a pasta, exportar, repetir. */
export default function DownloadsScreen({ onGoToSearch }: { onGoToSearch: () => void }) {
  const [history, setHistory] = useState<DownloadJob[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [exporting, setExporting] = useState<Track[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const live = useDownloadsStore((s) => s.jobs);
  const cancel = useDownloadsStore((s) => s.cancel);
  const start = useDownloadsStore((s) => s.start);
  const downloadDir = useSettingsStore((s) => s.downloadDir);
  const setQueue = usePlayerStore((s) => s.setQueue);

  const reload = useCallback(() => {
    api.listDownloadJobs().then(setHistory).catch(() => setHistory([]));
  }, []);

  // Re-read the persisted history whenever a live job changes state.
  useEffect(() => { reload(); }, [reload, live]);

  /** The live store is the source of truth for in-flight jobs; the DB row is
   *  the truth for everything already finished. */
  const rows = useMemo(() => {
    return history.map((j) => {
      const l = live[j.id];
      return {
        ...j,
        status: (l?.status ?? j.status) as JobStatus,
        progress: l?.progress ?? j.progress,
        title: l?.title || j.title || j.url || "(sem título)",
        message: l?.message ?? "",
        speed: l?.speed ?? "",
        eta: l?.eta ?? "",
      };
    });
  }, [history, live]);

  const filtered = useMemo(
    () => rows.filter((r) => filter === "all"
      || (filter === "running" && r.status === "running")
      || (filter === "done" && r.status === "done")
      || (filter === "error" && (r.status === "error" || r.status === "canceled"))),
    [rows, filter]
  );

  // Só as faixas concluídas têm letra a mostrar; a lista de ids é a chave da
  // consulta, então mantê-la curta evita refazê-la a cada tick de progresso.
  const finishedIds = useMemo(
    () => rows.filter((r) => r.status === "done" && r.track_id).map((r) => r.track_id!),
    [rows]
  );
  const lyrics = useLyricsStatus(finishedIds);

  const counts = useMemo(() => ({
    running: rows.filter((r) => r.status === "running").length,
    done: rows.filter((r) => r.status === "done").length,
    error: rows.filter((r) => r.status === "error" || r.status === "canceled").length,
  }), [rows]);

  const play = async (trackId: number | null) => {
    if (!trackId) return;
    try {
      const all = await api.listTracks();
      const i = all.findIndex((t) => t.id === trackId);
      if (i >= 0) setQueue(all, i);
      else toast.error("Faixa não encontrada", "Ela pode ter sido removida da biblioteca.");
    } catch (e) {
      toast.error("Não foi possível tocar", String(e));
    }
  };

  const exportOne = async (trackId: number | null) => {
    if (!trackId) return;
    try {
      const all = await api.listTracks();
      const t = all.find((x) => x.id === trackId);
      if (t) setExporting([t]);
      else toast.error("Faixa não encontrada", "Ela pode ter sido removida da biblioteca.");
    } catch (e) {
      toast.error("Não foi possível exportar", String(e));
    }
  };

  const clearHistory = async () => {
    try {
      const n = await api.clearDownloadHistory();
      toast.success("Histórico limpo", `${n} registro(s) removido(s). Os arquivos continuam no disco.`);
      reload();
    } catch (e) {
      toast.error("Não foi possível limpar", String(e));
    } finally {
      setConfirmClear(false);
    }
  };

  return (
    <div className="pb-4">
      <PageHeader
        title="Downloads"
        subtitle="Acompanhe o que está baixando e reveja tudo o que já baixou. As músicas entram na biblioteca automaticamente."
        actions={
          <>
            {downloadDir && (
              <Button onClick={() => api.openPath(downloadDir).catch((e) => toast.error("Não foi possível abrir", String(e)))}>
                <IconFolder size={15} /> Abrir a pasta
              </Button>
            )}
            <Button variant="primary" onClick={onGoToSearch}>
              <IconDownload size={15} /> Baixar música
            </Button>
          </>
        }
      />

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <Segmented value={filter} onChange={setFilter} options={FILTERS} size="sm" />
          <div className="flex items-center gap-2 text-xs text-muted">
            {counts.running > 0 && <Badge tone="brand">{counts.running} em andamento</Badge>}
            {counts.done > 0 && <Badge tone="success">{counts.done} concluído(s)</Badge>}
            {counts.error > 0 && <Badge tone="danger">{counts.error} com problema</Badge>}
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setConfirmClear(true)}>
            <IconTrash size={14} /> Limpar histórico
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconDownload size={22} />}
          title={rows.length === 0 ? "Você ainda não baixou nada" : "Nada neste filtro"}
          description={
            rows.length === 0
              ? "Vá em “Buscar & Baixar”, pesquise pelo nome da música e baixe. Ela chega aqui e na sua biblioteca."
              : "Troque o filtro acima para ver os outros downloads."
          }
          action={rows.length === 0 ? <Button variant="primary" onClick={onGoToSearch}><IconDownload size={15} /> Ir para Buscar & Baixar</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((j) => {
            const st = STATUS[j.status] ?? STATUS.pending;
            return (
              <div key={j.id} className="bg-panel border border-line/[.09] rounded-2xl px-4 py-3 animate-fade-in">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                    ${j.status === "done" ? "bg-success/15 text-success"
                      : j.status === "error" ? "bg-danger/15 text-danger"
                      : "bg-brand/15 text-brand"}`}>
                    {j.status === "done" ? <IconCheck size={15} />
                      : j.status === "error" ? <IconAlert size={15} />
                      : <IconDownload size={15} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-content truncate max-w-full">{j.title}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {j.type === "playlist" && <Badge>playlist</Badge>}
                      {j.status === "done" && j.track_id && lyrics.has(j.track_id) && (
                        <LyricsBadge kind={lyrics.get(j.track_id)} />
                      )}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5 truncate">
                      {j.created_at ? fmtDate(j.created_at) : ""}
                      {j.url && j.url !== j.title ? ` · ${j.url}` : ""}
                    </div>

                    {j.status === "running" && (
                      <>
                        <ProgressBar className="mt-2" value={j.progress} indeterminate={j.progress >= 99.5} />
                        <div className="mt-1 text-[11px] text-muted flex flex-wrap gap-x-3">
                          <span className="tabular-nums">{Math.round(j.progress)}%</span>
                          {j.speed && <span>{j.speed}</span>}
                          {j.eta && <span>faltam {j.eta}</span>}
                          {j.message && <span className="truncate">{j.message}</span>}
                        </div>
                      </>
                    )}

                    {(j.status === "error" || j.status === "canceled") && (j.error || j.message) && (
                      <div className="mt-1.5 text-xs text-danger break-words">{j.message || j.error}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {j.status === "running" && (
                      <IconButton label="Cancelar download" onClick={() => cancel(j.id)}>
                        <IconStop size={13} />
                      </IconButton>
                    )}
                    {j.status === "done" && j.track_id && (
                      <>
                        <IconButton label="Tocar" onClick={() => play(j.track_id)}><IconPlay size={14} /></IconButton>
                        <IconButton label="Exportar para outra pasta" onClick={() => exportOne(j.track_id)}>
                          <IconExport size={15} />
                        </IconButton>
                      </>
                    )}
                    {j.status === "done" && j.file_path && (
                      <IconButton
                        label="Abrir a pasta do arquivo"
                        onClick={() => api.openPath(j.file_path!).catch((e) => toast.error("Não foi possível abrir", String(e)))}
                      >
                        <IconFolder size={15} />
                      </IconButton>
                    )}
                    {(j.status === "error" || j.status === "canceled") && j.url && (
                      <IconButton
                        label="Tentar de novo"
                        onClick={() => start(j.url!, destKindOf(j.dest_kind), j.dest_id ?? undefined, j.title)}
                      >
                        <IconRefresh size={15} />
                      </IconButton>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {exporting && <ExportModal tracks={exporting} onClose={() => setExporting(null)} />}
      {confirmClear && (
        <Modal
          title="Limpar o histórico de downloads?"
          onClose={() => setConfirmClear(false)}
          width="w-[440px]"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancelar</Button>
              <Button variant="danger" onClick={clearHistory}>Limpar</Button>
            </>
          }
        >
          <p className="text-sm text-muted leading-relaxed pb-2">
            Isso apaga apenas a lista desta tela. <b className="text-content">As músicas continuam na sua
            biblioteca e os arquivos no disco.</b>
          </p>
        </Modal>
      )}
    </div>
  );
}
