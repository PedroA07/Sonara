import { useEffect, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AudioFormat, ThemeMode, ToolStatus } from "../types";
import { api, isDesktop } from "../lib/ipc";
import { useSettingsStore } from "../store/useSettingsStore";
import { toast } from "../store/useToastStore";
import { SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import DuplicatesModal from "../components/DuplicatesModal";
import { APP_VERSION } from "../version";
import { Badge, Button, PageHeader, Segmented, Spinner, Toggle } from "../components/ui";
import { IconFolder, IconRefresh, IconCheck, IconAlert, IconSparkle } from "../components/icons";

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "dark", label: "Escuro" },
  { value: "light", label: "Claro" },
  { value: "system", label: "Do sistema" },
];

const FORMATS: { value: AudioFormat; label: string; hint: string }[] = [
  { value: "m4a", label: "M4A", hint: "Melhor qualidade. Mantém o áudio original, sem reconverter. Recomendado." },
  { value: "mp3", label: "MP3", hint: "Toca em qualquer aparelho — rádio de carro, caixas de som antigas, pendrives." },
  { value: "opus", label: "OPUS", hint: "Arquivos menores com boa qualidade, mas nem todo aparelho reconhece." },
  { value: "flac", label: "FLAC", hint: "Sem perdas no arquivo final; a fonte do YouTube já é comprimida." },
];

export default function SettingsScreen() {
  const {
    theme, crossfade, replaygain, downloadDir, audioFormat,
    setTheme, setCrossfade, setReplaygain, setDownloadDir, setAudioFormat,
  } = useSettingsStore();

  const [dupes, setDupes] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [tools, setTools] = useState<ToolStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const checkTools = async () => {
    setChecking(true);
    try { setTools(await api.checkDownloadTools()); }
    catch { setTools(null); }
    finally { setChecking(false); }
  };

  useEffect(() => { if (isDesktop) checkTools(); }, []);

  const pickFolder = async () => {
    try {
      const dir = await open({ directory: true, multiple: false, title: "Pasta para salvar os downloads" });
      if (typeof dir === "string") {
        setDownloadDir(dir);
        toast.success("Pasta de downloads alterada", dir);
        checkTools();
      }
    } catch (e) {
      toast.error("Não foi possível escolher a pasta", String(e));
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      await api.rebuildSearchIndex();
      toast.success("Índice de busca reconstruído");
    } catch (e) {
      toast.error("Falha ao reindexar", String(e));
    } finally {
      setReindexing(false);
    }
  };

  const ready = tools?.ytdlp_version && tools?.ffmpeg_path && tools?.download_dir_writable;

  return (
    <div className="max-w-3xl pb-6">
      <PageHeader title="Configurações" subtitle="Ajuste onde as músicas são salvas, o formato dos downloads e a aparência do app." />

      {/* ── Downloads ───────────────────────────────────────────── */}
      <Section title="Downloads" description="Para onde vão as músicas que você baixar.">
        <Row label="Pasta de downloads" hint={downloadDir || "usando a pasta padrão de músicas"}>
          <div className="flex gap-2">
            {downloadDir && (
              <Button size="sm" onClick={() => api.openPath(downloadDir).catch((e) => toast.error("Não foi possível abrir", String(e)))}>
                <IconFolder size={14} /> Abrir
              </Button>
            )}
            <Button size="sm" onClick={pickFolder}>Alterar…</Button>
          </div>
        </Row>

        <div className="px-4 py-3.5">
          <div className="text-sm text-content mb-1">Formato do arquivo baixado</div>
          <p className="text-xs text-muted mb-2.5">
            {FORMATS.find((f) => f.value === audioFormat)?.hint}
          </p>
          <Segmented
            value={audioFormat}
            onChange={(v) => { setAudioFormat(v); toast.success(`Downloads agora em ${v.toUpperCase()}`); }}
            options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
            size="sm"
          />
        </div>
      </Section>

      {/* ── Diagnostics: what makes downloads work ───────────────── */}
      <Section
        title="Diagnóstico"
        description="Se um download falhar, comece por aqui — isto mostra exatamente qual peça está faltando."
      >
        <div className="px-4 py-4 space-y-2.5">
          {!isDesktop ? (
            <p className="text-sm text-muted">Disponível apenas no aplicativo instalado.</p>
          ) : checking && !tools ? (
            <p className="text-sm text-muted flex items-center gap-2"><Spinner /> Verificando…</p>
          ) : (
            <>
              <Check
                ok={!!tools?.ytdlp_version}
                label="yt-dlp (baixa as músicas)"
                detail={tools?.ytdlp_version ? `versão ${tools.ytdlp_version}` : "não encontrado — reinstale o Sonara"}
              />
              <Check
                ok={!!tools?.ffmpeg_path}
                label="ffmpeg (converte e grava as capas)"
                detail={tools?.ffmpeg_path ?? "não encontrado — reinstale o Sonara"}
              />
              <Check
                ok={!!tools?.download_dir_writable}
                label="Pasta de downloads gravável"
                detail={tools?.download_dir ?? "—"}
              />
              <div className="pt-1.5 flex items-center gap-3">
                <Button size="sm" onClick={checkTools} loading={checking}>
                  <IconRefresh size={14} /> Verificar de novo
                </Button>
                {ready && <span className="text-xs text-success">Tudo pronto para baixar.</span>}
              </div>
            </>
          )}
        </div>
      </Section>

      {/* ── Playback ────────────────────────────────────────────── */}
      <Section title="Reprodução">
        <Row
          label="Transição entre músicas"
          hint={crossfade === 0 ? "Desligada — uma música começa quando a outra termina." : `${crossfade}s de sobreposição entre uma música e a próxima.`}
        >
          <input
            type="range" min={0} max={12} step={1} value={crossfade}
            onChange={(e) => setCrossfade(Number(e.target.value))}
            aria-label="Duração da transição"
            className="w-44 track-range"
            style={{ ["--pct" as string]: `${(crossfade / 12) * 100}%` }}
          />
        </Row>
        <Row
          label="Equalizar o volume entre faixas"
          hint="Usa a informação de ReplayGain das tags para que nenhuma música toque muito mais alta que as outras."
        >
          <Toggle checked={replaygain} onChange={setReplaygain} label="Equalizar o volume entre faixas" />
        </Row>
      </Section>

      {/* ── Appearance ──────────────────────────────────────────── */}
      <Section title="Aparência">
        <Row label="Tema" hint="Atalho: tecla T alterna entre claro e escuro.">
          <Segmented value={theme} onChange={setTheme} options={THEMES} size="sm" />
        </Row>
      </Section>

      {/* ── Maintenance ─────────────────────────────────────────── */}
      <Section title="Manutenção da biblioteca">
        <Row label="Reconstruir o índice de busca" hint="Use se a busca deixar de encontrar músicas que existem.">
          <Button size="sm" onClick={reindex} loading={reindexing}>
            <IconSparkle size={14} /> Reindexar
          </Button>
        </Row>
        <Row label="Procurar músicas duplicadas" hint="Encontra faixas com o mesmo título e duração e deixa você escolher quais remover.">
          <Button size="sm" onClick={() => setDupes(true)}>Procurar</Button>
        </Row>
      </Section>

      {/* ── Shortcuts ───────────────────────────────────────────── */}
      <Section title="Atalhos de teclado">
        <ul className="px-4 py-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center gap-3">
              <kbd className="px-2 py-0.5 rounded-md bg-panel2 border border-line/[.12] text-[11px] font-mono text-content shrink-0">
                {s.keys}
              </kbd>
              <span className="text-muted text-xs">{s.action}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Sobre">
        <Row label="Versão instalada" hint="As atualizações são avisadas automaticamente ao abrir o app.">
          <Badge tone="brand">Sonara {APP_VERSION}</Badge>
        </Row>
      </Section>

      {dupes && <DuplicatesModal onClose={() => setDupes(false)} />}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-sm font-semibold text-content mb-0.5">{title}</h2>
      {description && <p className="text-xs text-muted mb-2.5">{description}</p>}
      {!description && <div className="mb-2.5" />}
      <div className="bg-panel border border-line/[.09] rounded-2xl divide-y divide-line/[.07] overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-sm text-content">{label}</div>
        {hint && <div className="text-xs text-muted mt-0.5 break-words">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A single green/red line in the diagnostics block. */
function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0
        ${ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
        {ok ? <IconCheck size={12} /> : <IconAlert size={12} />}
      </span>
      <div className="min-w-0">
        <div className="text-sm text-content">{label}</div>
        <div className="text-xs text-muted break-all">{detail}</div>
      </div>
    </div>
  );
}
