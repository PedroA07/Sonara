import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lyrics } from "../../types";
import { usePlayerStore, subscribePosition } from "../../store/usePlayerStore";
import { useLyricsStore } from "../../store/useLyricsStore";
import { activeLineIndex, isFollowable } from "../../lib/lyrics";
import { Button, Spinner } from "../ui";
import { IconAlert, IconEdit, IconMusic, IconSearch, IconSettings } from "../icons";

/** Tempo sem interação até o auto-follow voltar sozinho. */
const RESUME_AFTER_MS = 4_000;

export default function LyricsPane({
  onEdit,
  onSearch,
  onOpenSettings,
}: {
  onEdit: () => void;
  onSearch: () => void;
  onOpenSettings: () => void;
}) {
  const { lyrics, status, error } = useLyricsStore();
  const retry = useLyricsStore((s) => s.retry);

  if (status === "loading") return <LoadingSkeleton />;
  if (status === "error") return <ErrorState message={error} onRetry={onEdit} />;
  if (status === "network-off") return <NetworkOffState onOpenSettings={onOpenSettings} onEdit={onEdit} />;
  if (status === "none" || !lyrics) return <EmptyState onEdit={onEdit} onSearch={onSearch} onRetry={retry} />;
  if (lyrics.kind === "instrumental") return <InstrumentalState />;
  if (!isFollowable(lyrics)) return <PlainLyrics lyrics={lyrics} onEdit={onEdit} onSearch={onSearch} />;

  return <SyncedLyrics lyrics={lyrics} onEdit={onEdit} onSearch={onSearch} />;
}

/* ─────────────────────────── letra sincronizada ─────────────────────────── */

function SyncedLyrics({ lyrics, onEdit, onSearch }: {
  lyrics: Lyrics; onEdit: () => void; onSearch: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const requestSeek = usePlayerStore((s) => s.requestSeek);

  const [activeIdx, setActiveIdx] = useState(-1);
  const [following, setFollowing] = useState(true);
  const resumeTimer = useRef<number | undefined>(undefined);

  const lines = lyrics.lines;
  // A busca binária precisa de um array estável; `lines` já vem pronto do core.
  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  /** Centraliza a linha ativa movendo o container por transform (nunca
   *  scrollTop animado, que brigaria com a rolagem da pessoa). */
  const centerOn = useCallback(
    (index: number, animate: boolean) => {
      const el = rowRefs.current[index];
      const box = scroller.current;
      const inner = track.current;
      if (!el || !box || !inner) return;
      const target = el.offsetTop + el.offsetHeight / 2 - box.clientHeight / 2;
      inner.style.transition =
        animate && !reduceMotion ? "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
      inner.style.transform = `translate3d(0, ${-Math.max(0, target)}px, 0)`;
    },
    [reduceMotion]
  );

  // O relógio é assinado fora do React: a 60 fps, um `useState` por quadro
  // re-renderizaria a letra inteira. Só a **troca de linha** vira estado.
  useEffect(() => {
    const apply = (positionMs: number) => {
      const idx = activeLineIndex(lines, positionMs);
      setActiveIdx((prev) => (prev === idx ? prev : idx));
    };
    apply(usePlayerStore.getState().positionMs);
    return subscribePosition(apply);
  }, [lines]);

  // Rolagem acompanha a linha ativa, quando o auto-follow está ligado.
  useEffect(() => {
    if (following && activeIdx >= 0) centerOn(activeIdx, true);
  }, [activeIdx, following, centerOn]);

  // Trocar de faixa recomeça do topo, sem animar.
  useEffect(() => {
    setFollowing(true);
    rowRefs.current = [];
    const inner = track.current;
    if (inner) {
      inner.style.transition = "none";
      inner.style.transform = "translate3d(0,0,0)";
    }
  }, [lyrics.trackId]);

  const suspendFollow = useCallback(() => {
    setFollowing(false);
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setFollowing(true), RESUME_AFTER_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  const resumeNow = () => {
    window.clearTimeout(resumeTimer.current);
    setFollowing(true);
    if (activeIdx >= 0) centerOn(activeIdx, true);
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scroller}
        onWheel={suspendFollow}
        onTouchMove={suspendFollow}
        className="flex-1 min-h-0 overflow-hidden px-6"
        // `log` + `polite` só valem quando a letra tem foco: anunciar cada linha
        // durante a reprodução tornaria o leitor de tela insuportável.
        role="log"
        aria-live="off"
        aria-label="Letra sincronizada"
      >
        <div ref={track} className="py-[38vh] will-change-transform">
          {lines.map((line, i) => {
            const distance = activeIdx < 0 ? 99 : Math.abs(i - activeIdx);
            const isActive = i === activeIdx;

            if (line.isGap) {
              return (
                <div key={i} className="flex justify-center py-4" aria-hidden="true">
                  <GapDots active={isActive} />
                </div>
              );
            }

            return (
              <button
                key={i}
                ref={(el) => { rowRefs.current[i] = el; }}
                onClick={() => requestSeek(line.startMs)}
                title={`Ir para ${fmtTag(line.startMs)}`}
                aria-current={isActive ? "true" : undefined}
                className={`group block w-full text-left rounded-lg px-4 py-2 transition-[color,transform] duration-200
                  ${line.isChorus ? "border-l-[3px] border-brand/70 pl-4" : "border-l-[3px] border-transparent pl-4"}
                  ${isActive
                    ? "text-content font-semibold text-[26px] leading-snug"
                    : distance === 1
                      ? "text-lyric-near text-[22px] leading-snug"
                      : "text-lyric-far text-[22px] leading-snug"}`}
              >
                {line.text}
                {line.isChorus && isChorusStart(lines, i) && (
                  <span className="ml-2 align-middle text-[10px] uppercase tracking-wide text-brand/80">
                    refrão
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chip de retorno — só aparece quando a pessoa saiu do fluxo. */}
      {!following && (
        <button
          onClick={resumeNow}
          className="absolute left-1/2 -translate-x-1/2 bottom-4 z-10 px-4 py-2 rounded-full
            bg-elev border border-line/20 shadow-lift text-xs font-medium text-content
            hover:border-brand/50 transition-colors animate-fade-up"
        >
          Voltar para a linha atual
        </button>
      )}

      <LyricsFooter lyrics={lyrics} onEdit={onEdit} onSearch={onSearch} />
    </div>
  );
}

function isChorusStart(lines: Lyrics["lines"], i: number): boolean {
  const prev = lines[i - 1];
  return !prev?.isChorus || prev.chorusId !== lines[i].chorusId;
}

function fmtTag(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Três pontos que pulsam durante o trecho instrumental. */
function GapDots({ active }: { active: boolean }) {
  return (
    <span className={`lyric-dots ${active ? "" : "opacity-30"}`}>
      <i /><i /><i />
    </span>
  );
}

/* ─────────────────────────── rodapé e calibração ─────────────────────────── */

function LyricsFooter({ lyrics, onEdit, onSearch }: {
  lyrics: Lyrics; onEdit: () => void; onSearch: () => void;
}) {
  const nudgeOffset = useLyricsStore((s) => s.nudgeOffset);
  const setOffset = useLyricsStore((s) => s.setOffset);
  const offset = lyrics.offsetMs;

  return (
    <div className="shrink-0 flex items-center gap-2 px-6 py-3 border-t divider text-[11px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        Sincronia
        <button
          onClick={() => nudgeOffset(-100)}
          className="px-1.5 py-0.5 rounded bg-panel2 hover:text-content"
          title="Adiantar a letra em 100 ms (tecla [)"
        >
          −
        </button>
        <span className="tabular-nums w-16 text-center text-content">
          {offset > 0 ? "+" : ""}{(offset / 1000).toFixed(1)}s
        </span>
        <button
          onClick={() => nudgeOffset(100)}
          className="px-1.5 py-0.5 rounded bg-panel2 hover:text-content"
          title="Atrasar a letra em 100 ms (tecla ])"
        >
          +
        </button>
        {offset !== 0 && (
          <button onClick={() => setOffset(0)} className="ml-1 text-brand hover:underline">
            zerar
          </button>
        )}
      </span>

      <button onClick={onSearch} className="ml-auto inline-flex items-center gap-1.5 hover:text-content">
        <IconSearch size={12} /> Trocar letra
      </button>
      <button onClick={onEdit} className="inline-flex items-center gap-1.5 hover:text-content">
        <IconEdit size={12} /> Editar
      </button>

      {/* Crédito à origem, exigido pelos termos do provedor. */}
      {lyrics.source === "provider" && lyrics.provider && (
        <span className="text-muted/70">letra via {lyrics.provider}</span>
      )}
    </div>
  );
}

/* ─────────────────────────── estados ─────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col justify-center gap-4 px-10" aria-busy="true">
      {[0.5, 0.8, 0.65, 0.9, 0.55, 0.7].map((w, i) => (
        <div key={i} className="skeleton h-6 rounded-lg" style={{ width: `${w * 100}%` }} />
      ))}
    </div>
  );
}

function Shell({ icon, title, description, children }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
      <span className="w-14 h-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
        {icon}
      </span>
      <div>
        <h3 className="font-semibold text-content">{title}</h3>
        <p className="text-sm text-muted mt-1.5 max-w-sm">{description}</p>
      </div>
      {children && <div className="flex gap-2 flex-wrap justify-center">{children}</div>}
    </div>
  );
}

function EmptyState({
  onEdit, onSearch, onRetry,
}: {
  onEdit: () => void;
  onSearch: () => void;
  onRetry: () => void;
}) {
  return (
    <Shell
      icon={<IconSearch size={22} />}
      title="Nenhuma letra encontrada"
      description="Não achei letra no arquivo, num .lrc ao lado dele, nem no serviço online com este título e duração."
    >
      <Button variant="primary" onClick={onSearch}><IconSearch size={15} /> Procurar manualmente</Button>
      <Button onClick={onEdit}><IconEdit size={15} /> Colar a letra</Button>
      <Button variant="ghost" onClick={onRetry}>Tentar de novo</Button>
    </Shell>
  );
}

function NetworkOffState({ onOpenSettings, onEdit }: { onOpenSettings: () => void; onEdit: () => void }) {
  return (
    <Shell
      icon={<IconSettings size={22} />}
      title="Buscar letras online está desativado"
      description="Esta música não tem letra no arquivo. Você pode ligar a busca online em Configurações, ou colar a letra você mesmo."
    >
      <Button variant="primary" onClick={onOpenSettings}>Abrir Configurações</Button>
      <Button onClick={onEdit}><IconEdit size={15} /> Colar a letra</Button>
    </Shell>
  );
}

function InstrumentalState() {
  return (
    <Shell
      icon={<IconMusic size={22} />}
      title="Faixa instrumental"
      description="Esta música não tem letra — é só instrumental."
    />
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Shell
      icon={<IconAlert size={22} />}
      title="Não foi possível carregar a letra"
      description={message}
    >
      <Button onClick={onRetry}>Colar a letra</Button>
    </Shell>
  );
}

/** Letra sem tempo: rola normal, sem destaque, e oferece procurar uma com sincronia. */
function PlainLyrics({ lyrics, onEdit, onSearch }: {
  lyrics: Lyrics; onEdit: () => void; onSearch: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-6 pt-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-warn bg-warn/10 border border-warn/25 rounded-full px-3 py-1">
          <IconAlert size={12} /> Esta letra não tem sincronia — não acompanha a música
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        {lyrics.lines.map((l, i) =>
          l.isGap ? (
            <div key={i} className="h-4" />
          ) : (
            <p key={i} className="text-[19px] leading-relaxed text-content/85">{l.text}</p>
          )
        )}
      </div>
      <LyricsFooter lyrics={lyrics} onEdit={onEdit} onSearch={onSearch} />
    </div>
  );
}
