import { useEffect, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AudioFormat, ThemeMode, ToolStatus, VideoStorage } from "../types";
import { api, isDesktop } from "../lib/ipc";
import { useSettingsStore } from "../store/useSettingsStore";
import { toast } from "../store/useToastStore";
import { SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import DuplicatesModal from "../components/DuplicatesModal";
import { canPlayH264 } from "../lib/media";
import { fmtBytes } from "../lib/format";
import { APP_VERSION } from "../version";
import { Badge, Button, PageHeader, Segmented, Spinner, Toggle } from "../components/ui";
import { IconFolder, IconRefresh, IconCheck, IconAlert, IconSparkle, IconTrash, IconVideo } from "../components/icons";

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

const VIDEO_QUALITIES: { value: string; label: string; hint: string }[] = [
  { value: "720p", label: "720p", hint: "Padrão. Boa nitidez na janela do app, arquivos de 40–120 MB." },
  { value: "1080p", label: "1080p", hint: "Mais nítido em tela cheia; os arquivos costumam dobrar de tamanho." },
  { value: "max", label: "Máxima", hint: "A melhor que o YouTube tiver em H.264. Pode passar de 500 MB por música." },
];

/** Manual publicado junto com a landing page (GitHub Pages). */
const HELP_URL = "https://pedroa07.github.io/Sonara/ajuda/";

export default function SettingsScreen() {
  const {
    theme, crossfade, replaygain, downloadDir, audioFormat,
    lyricsProviderEnabled, lyricsMiniLine, lyricsAutoFetchOnDownload, videoQuality,
    setTheme, setCrossfade, setReplaygain, setDownloadDir, setAudioFormat,
    setLyricsProviderEnabled, setLyricsMiniLine, setLyricsAutoFetchOnDownload, setVideoQuality,
  } = useSettingsStore();

  const [dupes, setDupes] = useState(false);
  const [storage, setStorage] = useState<VideoStorage | null>(null);
  const [clearing, setClearing] = useState(false);
  // Consultado uma vez, no cliente: no Windows e no macOS é sempre verdadeiro,
  // no Linux depende dos plugins do GStreamer instalados na distribuição.
  const [h264] = useState(() => canPlayH264());
  const [reindexing, setReindexing] = useState(false);
  const [tools, setTools] = useState<ToolStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const checkTools = async () => {
    setChecking(true);
    try { setTools(await api.checkDownloadTools()); }
    catch { setTools(null); }
    finally { setChecking(false); }
  };

  const loadStorage = () => {
    api.videoStorage().then(setStorage).catch(() => setStorage(null));
  };

  useEffect(() => { if (isDesktop) { checkTools(); loadStorage(); } }, []);

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
              {/* No Linux o WebKitGTK só decodifica H.264 com os plugins do
                  GStreamer instalados. Sem isso a aba Vídeo não aparece — e é
                  melhor dizer o porquê do que sumir sem explicação. */}
              <Check
                ok={h264}
                label="Vídeo H.264 (modo vídeo)"
                detail={
                  h264
                    ? "este sistema toca os vídeos baixados pelo Sonara"
                    : "faltam os codecs do sistema (no Linux: instale gstreamer1.0-libav e gstreamer1.0-plugins-good)"
                }
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

      {/* ── Letras ──────────────────────────────────────────────── */}
      <Section
        title="Letras"
        description="O Sonara sempre lê a letra que já vem dentro do arquivo de música ou de um .lrc ao lado dele. A busca online é uma escolha sua."
      >
        <Row
          label="Buscar letras na internet"
          hint="Quando o arquivo não traz letra, consultar um serviço público de letras (LRCLIB) usando o nome da música, o artista e a duração. Desligado, nada sai do seu computador."
        >
          <Toggle
            checked={lyricsProviderEnabled}
            onChange={(v) => {
              setLyricsProviderEnabled(v);
              toast.success(v ? "Busca de letras ligada" : "Busca de letras desligada");
            }}
            label="Buscar letras na internet"
          />
        </Row>
        <Row
          label="Procurar a letra ao baixar uma música"
          hint={
            lyricsProviderEnabled
              ? "Assim que um download termina, a letra é procurada em segundo plano. O download nunca espera por isso."
              : "Precisa da busca na internet ligada acima."
          }
        >
          <Toggle
            checked={lyricsAutoFetchOnDownload}
            onChange={setLyricsAutoFetchOnDownload}
            disabled={!lyricsProviderEnabled}
            label="Procurar a letra ao baixar"
          />
        </Row>
        <Row
          label="Mostrar a linha atual na barra do player"
          hint="Substitui o nome do artista pela linha que está sendo cantada, enquanto a letra estiver carregada."
        >
          <Toggle checked={lyricsMiniLine} onChange={setLyricsMiniLine} label="Mostrar a linha atual na barra" />
        </Row>
        <p className="text-[11px] text-muted/80 leading-relaxed pt-1">
          As letras vêm do <b className="text-content/80">LRCLIB</b>, um acervo público e colaborativo, e ficam
          guardadas só no seu computador. O Sonara se identifica no pedido e respeita os limites do serviço.
        </p>
      </Section>

      {/* ── Vídeo e armazenamento ───────────────────────────────── */}
      <Section
        title="Vídeo"
        description="O vídeo de uma música é um arquivo à parte, baixado só quando você pede. A música em si nunca é substituída."
      >
        {h264 ? (
          <>
            <div className="px-4 py-3.5">
              <div className="text-sm text-content mb-1">Qualidade do vídeo</div>
              <p className="text-xs text-muted mb-2.5">
                {VIDEO_QUALITIES.find((q) => q.value === videoQuality)?.hint}
              </p>
              <Segmented
                value={videoQuality}
                onChange={(v) => { setVideoQuality(v); toast.success(`Vídeos agora em ${v}`); }}
                options={VIDEO_QUALITIES.map((q) => ({ value: q.value, label: q.label }))}
                size="sm"
              />
            </div>

            <div className="px-4 py-3.5">
              <div className="flex items-center gap-2 mb-1">
                <IconVideo size={15} className="text-muted" />
                <span className="text-sm text-content">Espaço usado pelos vídeos</span>
              </div>
              {storage === null ? (
                <p className="text-xs text-muted">—</p>
              ) : storage.items.length === 0 ? (
                <p className="text-xs text-muted">
                  Nenhum vídeo baixado. Abra a aba <b className="text-content/80">Vídeo</b> em “Tocando agora”
                  para baixar o de uma música.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted mb-2.5">
                    <b className="text-content">{fmtBytes(storage.totalBytes)}</b> em {storage.items.length}{" "}
                    {storage.items.length === 1 ? "vídeo" : "vídeos"}. Apagar os vídeos não mexe nas músicas.
                  </p>
                  <ul className="space-y-1 max-h-56 overflow-y-auto mb-2.5">
                    {storage.items.map((v) => (
                      <li
                        key={v.trackId}
                        className="flex items-center gap-3 text-xs bg-panel2 border border-line/[.08] rounded-lg px-2.5 py-1.5"
                      >
                        <span className="truncate flex-1 text-content/90">{v.title}</span>
                        {v.missing ? (
                          <span className="text-warn shrink-0">arquivo sumiu</span>
                        ) : (
                          <span className="text-muted shrink-0 tabular-nums">
                            {v.height ? `${v.height}p · ` : ""}{fmtBytes(v.bytes)}
                          </span>
                        )}
                        <IconButtonInline
                          label={`Apagar o vídeo de ${v.title}`}
                          onClick={async () => {
                            try {
                              await api.deleteVideo(v.trackId);
                              loadStorage();
                            } catch (e) {
                              toast.error("Não foi possível apagar", String(e));
                            }
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={loadStorage}><IconRefresh size={14} /> Atualizar</Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={clearing}
                      onClick={async () => {
                        if (!window.confirm(
                          `Apagar ${storage.items.length} vídeo(s) e liberar ${fmtBytes(storage.totalBytes)}?\n\nAs músicas continuam na biblioteca.`
                        )) return;
                        setClearing(true);
                        try {
                          const n = await api.deleteAllVideos();
                          toast.success(`${n} vídeo(s) apagado(s)`, "As músicas continuam na biblioteca.");
                          loadStorage();
                        } catch (e) {
                          toast.error("Não foi possível apagar", String(e));
                        } finally {
                          setClearing(false);
                        }
                      }}
                    >
                      <IconTrash size={14} /> Apagar todos
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="px-4 py-3.5">
            <p className="text-sm text-muted leading-relaxed">
              Este sistema não consegue decodificar vídeo H.264, então a aba <b className="text-content/80">Vídeo</b>{" "}
              fica escondida. No Linux isso costuma ser resolvido instalando os plugins do GStreamer:
            </p>
            <code className="block mt-2 text-xs bg-panel2 border border-line/[.08] rounded-lg px-3 py-2 text-content/80">
              sudo apt install gstreamer1.0-libav gstreamer1.0-plugins-good
            </code>
          </div>
        )}
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
        <Row
          label="Ajuda online"
          hint="Manual com o passo a passo de tudo: baixar, exportar, letra, vídeo e o que fazer quando algo dá errado."
        >
          <Button
            size="sm"
            onClick={() => api.openUrl(HELP_URL).catch((e) => toast.error("Não foi possível abrir o manual", String(e)))}
          >
            Abrir o manual
          </Button>
        </Row>
        <p className="text-[11px] text-muted/80 leading-relaxed pt-1">
          Sonara é software livre. As letras, quando a busca online está ligada, vêm do{" "}
          <b className="text-content/80">LRCLIB</b>. Use o app para conteúdo que você tem o direito de
          baixar e respeite os direitos autorais e os termos dos serviços de origem.
        </p>
      </Section>

      {dupes && <DuplicatesModal onClose={() => setDupes(false)} />}
    </div>
  );
}

/** Lixeira minúscula das linhas da lista de vídeos. */
function IconButtonInline({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted
        hover:text-danger hover:bg-danger/10 transition-colors"
    >
      <IconTrash size={13} />
    </button>
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
