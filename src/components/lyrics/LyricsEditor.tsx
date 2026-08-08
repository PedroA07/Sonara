import { useMemo, useRef, useState } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useLyricsStore } from "../../store/useLyricsStore";
import { formatTimestamp, validateLrc } from "../../lib/lyrics";
import { Button, Modal } from "../ui";
import { IconAlert, IconCheck } from "../icons";

/**
 * Editor de letra: cola um LRC ou texto puro, valida enquanto digita e permite
 * marcar os tempos ouvindo a música.
 */
export default function LyricsEditor({ onClose }: { onClose: () => void }) {
  const stored = useLyricsStore((s) => s.lyrics);
  const setManual = useLyricsStore((s) => s.setManual);
  const remove = useLyricsStore((s) => s.remove);
  const positionMs = usePlayerStore((s) => s.positionMs);

  const initial = useMemo(() => toEditableText(stored), [stored]);
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const problems = useMemo(() => validateLrc(text), [text]);
  const badLines = useMemo(() => new Set(problems.map((p) => p.line)), [problems]);

  /**
   * Carimba o tempo atual da música na linha onde está o cursor e desce uma
   * linha — é assim que se sincroniza uma letra à mão: ouvindo e apertando.
   */
  const stampCurrentLine = () => {
    const el = area.current;
    if (!el) return;
    const before = text.slice(0, el.selectionStart);
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineEnd = text.indexOf("\n", lineStart);
    const end = lineEnd === -1 ? text.length : lineEnd;

    const body = text.slice(lineStart, end).replace(/^\[\d+:\d+(?:[.:]\d+)?\]\s*/, "");
    const stamped = `${formatTimestamp(positionMs)}${body}`;
    const next = text.slice(0, lineStart) + stamped + text.slice(end);
    setText(next);

    // Cursor no começo da próxima linha, pronto para o próximo carimbo.
    const caret = lineStart + stamped.length + 1;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(Math.min(caret, next.length), Math.min(caret, next.length));
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await setManual(text);
      onClose();
    } catch {
      setBusy(false); // a store já avisou o motivo
    }
  };

  const lineCount = text.split("\n").length;

  return (
    <Modal
      title="Editar a letra"
      subtitle="Cole a letra abaixo. Com tempos no formato [mm:ss.xx] ela acompanha a música; sem eles, fica só o texto."
      onClose={onClose}
      width="w-[680px]"
      footer={
        <>
          {stored && (
            <Button variant="danger" onClick={() => { remove(); onClose(); }} disabled={busy}>
              Remover a letra
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!text.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={stampCurrentLine} title="Carimba o tempo atual da música na linha do cursor">
            Marcar tempo {formatTimestamp(positionMs)}
          </Button>
          <span className="text-[11px] text-muted">
            Toque a música e clique a cada verso para sincronizar.
          </span>
          <span className="ml-auto text-[11px] text-muted tabular-nums">{lineCount} linhas</span>
        </div>

        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={16}
          placeholder={"[00:12.30]primeiro verso\n[00:16.80]segundo verso"}
          className="w-full bg-panel2 border border-line/[.09] rounded-xl px-3 py-2.5
            font-mono text-[13px] leading-relaxed outline-none resize-y
            focus:border-brand/60 focus:ring-2 focus:ring-brand/25"
        />

        {problems.length === 0 ? (
          text.trim() && (
            <p className="text-[11px] text-success flex items-center gap-1.5">
              <IconCheck size={12} /> Formato válido
            </p>
          )
        ) : (
          <ul className="text-[11px] text-warn space-y-0.5 max-h-24 overflow-y-auto">
            {problems.slice(0, 6).map((p, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <IconAlert size={12} className="mt-0.5 shrink-0" />
                {p.line > 0 ? `Linha ${p.line}: ${p.reason}` : p.reason}
              </li>
            ))}
            {problems.length > 6 && <li className="pl-4">e mais {problems.length - 6}…</li>}
          </ul>
        )}

        {badLines.size > 0 && (
          <p className="text-[11px] text-muted">
            Linhas com problema continuam salvas — elas só não vão acompanhar a música.
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Reconstrói o texto editável a partir da letra carregada.
 *
 * A letra vem do core já com o offset aplicado e as linhas de intervalo
 * inseridas; nenhuma das duas coisas pertence ao arquivo original, então são
 * desfeitas aqui — senão cada abertura do editor acumularia o deslocamento.
 */
function toEditableText(lyrics: ReturnType<typeof useLyricsStore.getState>["lyrics"]): string {
  if (!lyrics) return "";
  if (lyrics.kind === "plain") return lyrics.plainText ?? lyrics.lines.map((l) => l.text).join("\n");

  return lyrics.lines
    .filter((l) => !l.isGap)
    .map((l) => `${formatTimestamp(l.startMs - lyrics.offsetMs)}${l.text}`)
    .join("\n");
}
