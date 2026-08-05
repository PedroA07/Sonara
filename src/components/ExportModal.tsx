import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import type { ExportNaming, ExportOrganize, ExportProgress, Track } from "../types";
import { api } from "../lib/ipc";
import { toast } from "../store/useToastStore";
import { Button, Checkbox, Modal, ProgressBar, Segmented, TextField } from "./ui";
import { IconFolder, IconUsb } from "./icons";

const ORGANIZE: { value: ExportOrganize; label: string; hint: string }[] = [
  { value: "flat", label: "Tudo junto", hint: "Todos os arquivos soltos na pasta escolhida." },
  { value: "artist", label: "Por artista", hint: "Uma pasta para cada artista." },
  { value: "artist_album", label: "Artista / Álbum", hint: "Uma pasta por artista, com subpastas por álbum." },
];

const NAMING: { value: ExportNaming; label: string; example: string }[] = [
  { value: "title", label: "Só o título", example: "Minha Música.mp3" },
  { value: "artist_title", label: "Artista - Título", example: "Artista - Minha Música.mp3" },
  { value: "track_title", label: "Nº - Título", example: "03 - Minha Música.mp3" },
];

/** Copy the selected tracks somewhere else — a USB stick, a phone, a folder
 *  synced to the cloud. The originals always stay in the library. */
export default function ExportModal({
  tracks, defaultName, onClose,
}: {
  tracks: Track[];
  defaultName?: string;
  onClose: () => void;
}) {
  const [dest, setDest] = useState("");
  const [organize, setOrganize] = useState<ExportOrganize>("artist_album");
  const [naming, setNaming] = useState<ExportNaming>("artist_title");
  const [convert, setConvert] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [makeM3u, setMakeM3u] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [err, setErr] = useState("");
  const unlisten = useRef<null | (() => void)>(null);

  // Live per-file progress while the copy runs.
  useEffect(() => {
    listen<ExportProgress>("export-progress", (e) => setProgress(e.payload))
      .then((un) => { unlisten.current = un; })
      .catch(() => {});
    return () => { unlisten.current?.(); };
  }, []);

  const pickFolder = async () => {
    setErr("");
    try {
      const dir = await open({ directory: true, multiple: false, title: "Escolha a pasta de destino" });
      if (typeof dir === "string") setDest(dir);
    } catch {
      setErr("Não foi possível abrir o seletor de pastas.");
    }
  };

  const run = async () => {
    if (!dest) { setErr("Escolha a pasta de destino primeiro."); return; }
    setBusy(true); setErr(""); setProgress(null);
    try {
      const res = await api.exportTracks(tracks.map((t) => t.id), {
        dest_dir: dest,
        organize,
        naming,
        convert_mp3: convert,
        overwrite,
        playlist_file: makeM3u,
        playlist_name: defaultName ?? "Sonara",
      });

      const parts = [`${res.copied} copiada(s)`];
      if (res.skipped) parts.push(`${res.skipped} já existia(m)`);
      if (res.failed) parts.push(`${res.failed} com erro`);

      if (res.failed > 0 && res.copied === 0) {
        toast.error("A exportação falhou", res.errors[0] ?? parts.join(" · "));
      } else {
        toast.success("Exportação concluída", parts.join(" · "), {
          label: "Abrir pasta",
          run: () => { api.openPath(res.dest_dir).catch(() => {}); },
        });
      }
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const pct = progress ? (progress.index / Math.max(1, progress.total)) * 100 : 0;

  return (
    <Modal
      title={`Exportar ${tracks.length} ${tracks.length === 1 ? "música" : "músicas"}`}
      subtitle="As músicas são copiadas — os arquivos originais continuam na sua biblioteca."
      onClose={busy ? () => {} : onClose}
      width="w-[580px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" onClick={run} loading={busy} disabled={!dest}>
            <IconUsb size={16} /> {busy ? "Exportando…" : "Exportar agora"}
          </Button>
        </>
      }
    >
      <div className="space-y-5 pb-2">
        {/* 1 — where to */}
        <section>
          <Label n={1} text="Para onde?" />
          <div className="flex gap-2">
            <div
              className="flex-1 min-w-0 h-10 px-3 flex items-center gap-2 bg-panel2 border border-line/[.09] rounded-xl text-sm"
              title={dest || undefined}
            >
              <IconFolder size={15} className="text-muted shrink-0" />
              <span className={`truncate ${dest ? "text-content" : "text-muted"}`}>
                {dest || "Nenhuma pasta escolhida"}
              </span>
            </div>
            <Button onClick={pickFolder} disabled={busy}>Escolher…</Button>
          </div>
          <p className="text-[11px] text-muted mt-1.5">
            Pode ser um pendrive, um cartão SD, o celular conectado ou qualquer pasta do computador.
          </p>
        </section>

        {/* 2 — layout */}
        <section>
          <Label n={2} text="Como organizar as pastas?" />
          <Segmented value={organize} onChange={setOrganize} size="sm"
            options={ORGANIZE.map((o) => ({ value: o.value, label: o.label }))} />
          <p className="text-[11px] text-muted mt-1.5">{ORGANIZE.find((o) => o.value === organize)!.hint}</p>
        </section>

        {/* 3 — file names */}
        <section>
          <Label n={3} text="Como nomear os arquivos?" />
          <Segmented value={naming} onChange={setNaming} size="sm"
            options={NAMING.map((o) => ({ value: o.value, label: o.label }))} />
          <p className="text-[11px] text-muted mt-1.5 font-mono">
            {NAMING.find((o) => o.value === naming)!.example}
          </p>
        </section>

        {/* 4 — compatibility options */}
        <section className="space-y-2.5">
          <Label n={4} text="Opções" />
          <Opt
            checked={convert} onChange={setConvert}
            label="Converter para MP3"
            hint="Marque se o aparelho de destino não toca m4a/opus (rádio de carro, aparelhos antigos)."
          />
          <Opt
            checked={makeM3u} onChange={setMakeM3u}
            label="Criar uma playlist .m3u8"
            hint="Um arquivo de playlist na raiz da pasta, na ordem da seleção."
          />
          <Opt
            checked={overwrite} onChange={setOverwrite}
            label="Substituir arquivos existentes"
            hint="Desmarcado, arquivos repetidos são pulados e nada é perdido."
          />
        </section>

        {busy && (
          <div className="pt-1">
            <ProgressBar value={pct} />
            <p className="text-xs text-muted mt-2 truncate">
              {progress
                ? `${progress.index}/${progress.total} · ${progress.status === "converting" ? "Convertendo" : "Copiando"} ${progress.name}`
                : "Preparando…"}
            </p>
          </div>
        )}
        {err && <p className="text-danger text-sm break-words">{err}</p>}
      </div>
    </Modal>
  );
}

function Label({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-5 h-5 rounded-full bg-brand/15 text-brand text-[11px] font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="text-sm font-medium text-content">{text}</span>
    </div>
  );
}

function Opt({
  checked, onChange, label, hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div
      className="flex gap-3 items-start cursor-pointer group"
      onClick={() => onChange(!checked)}
    >
      <div className="mt-0.5"><Checkbox checked={checked} onChange={onChange} label={label} /></div>
      <div className="min-w-0">
        <div className="text-sm text-content group-hover:text-brand transition-colors">{label}</div>
        <div className="text-[11px] text-muted">{hint}</div>
      </div>
    </div>
  );
}
