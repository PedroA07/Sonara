import type { ReactNode } from "react";
import { useState } from "react";
import { api } from "../lib/ipc";
import DuplicatesModal from "../components/DuplicatesModal";
import { useSettingsStore } from "../store/useSettingsStore";

// F3: theme, crossfade, ReplayGain + keyboard shortcuts help. Persisted via backend.
export default function SettingsScreen() {
  const { theme, crossfade, replaygain, setTheme, setCrossfade, setReplaygain } = useSettingsStore();
  const [dupes, setDupes] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const reindex = async () => { setReindexing(true); try { await api.rebuildSearchIndex(); } catch {} setReindexing(false); };

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Configurações</h1>

      <Section title="Aparência">
        <Row label="Tema">
          <div className="flex gap-2">
            {(["dark", "light"] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)}
                className={`px-3 py-1.5 rounded-lg text-sm ${theme === t ? "bg-brand text-white" : "bg-panel2 text-muted hover:text-content"}`}>
                {t === "dark" ? "Escuro" : "Claro"}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Reprodução">
        <Row label={`Crossfade / gapless: ${crossfade}s`}>
          <input type="range" min={0} max={12} step={1} value={crossfade}
            onChange={(e) => setCrossfade(Number(e.target.value))} className="w-48 accent-brand" />
        </Row>
        <Row label="Normalização de volume (ReplayGain)">
          <input type="checkbox" checked={replaygain} onChange={(e) => setReplaygain(e.target.checked)} className="accent-brand w-5 h-5" />
        </Row>
      </Section>

      <Section title="Downloads">
        <Row label="Pasta de downloads"><span className="text-muted text-sm">~/Music/Sonara/downloads</span></Row>
        <Row label="yt-dlp / ffmpeg"><span className="text-muted text-sm">(empacotados) src-tauri/binaries</span></Row>
      </Section>

      <Section title="Manutenção">
        <Row label="Índice de busca (FTS5)">
          <button onClick={reindex} disabled={reindexing}
            className="px-3 py-1.5 rounded-lg text-sm bg-panel2 text-muted hover:text-content disabled:opacity-50">
            {reindexing ? "Reindexando…" : "Reindexar"}
          </button>
        </Row>
        <Row label="Duplicatas na biblioteca">
          <button onClick={() => setDupes(true)} className="px-3 py-1.5 rounded-lg text-sm bg-panel2 text-muted hover:text-content">
            Encontrar
          </button>
        </Row>
      </Section>

      <Section title="Atalhos de teclado">
        <ul className="text-sm text-muted grid grid-cols-2 gap-y-1">
          <li>Espaço — play/pause</li><li>← / → — retroceder/avançar 5s</li>
          <li>Shift + → — próxima</li><li>Shift + ← — anterior</li>
          <li>↑ / ↓ — volume</li><li>S — aleatório</li>
          <li>R — repetir</li><li>L — layout</li>
          <li>T — alternar tema</li><li></li>
        </ul>
      </Section>
      {dupes && <DuplicatesModal onClose={() => setDupes(false)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">{title}</h2>
      <div className="bg-panel rounded-xl divide-y divide-white/5">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-content text-sm">{label}</span>
      {children}
    </div>
  );
}
