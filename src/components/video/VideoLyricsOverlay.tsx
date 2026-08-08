import { useEffect, useState } from "react";
import { subscribePosition, usePlayerStore } from "../../store/usePlayerStore";
import { useLyricsStore } from "../../store/useLyricsStore";
import { activeLineIndex, isFollowable } from "../../lib/lyrics";

/** Quantas linhas mostrar de cada lado da atual. */
const CONTEXT = 1;

/**
 * Letra por cima do vídeo — três linhas, centradas embaixo.
 *
 * Três e não a letra inteira: o conteúdo principal aqui é a imagem. O
 * suficiente é ver a linha atual e ter para onde olhar antes e depois, que é
 * exatamente o que faz o refrão dar para acompanhar.
 *
 * Só a **troca de linha** vira estado, pelo mesmo motivo da mini-letra: assinar
 * `positionMs` no React re-renderizaria isto 60×/s por cima de um vídeo.
 */
export default function VideoLyricsOverlay() {
  const lyrics = useLyricsStore((s) => s.lyrics);
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (!isFollowable(lyrics) || !lyrics) { setIndex(-1); return; }
    const lines = lyrics.lines;
    const apply = (positionMs: number) => {
      const i = activeLineIndex(lines, positionMs);
      setIndex((prev) => (prev === i ? prev : i));
    };
    apply(usePlayerStore.getState().positionMs);
    return subscribePosition(apply);
  }, [lyrics]);

  if (!lyrics || index < 0) return null;

  const lines = lyrics.lines;
  const window = [];
  for (let i = index - CONTEXT; i <= index + CONTEXT; i++) {
    if (i >= 0 && i < lines.length) window.push({ i, line: lines[i] });
  }
  if (window.length === 0) return null;

  return (
    <div
      className="absolute inset-x-0 bottom-0 pt-24 pb-8 px-8 pointer-events-none
        bg-gradient-to-t from-black/85 via-black/45 to-transparent"
      role="log"
      aria-live="off"
    >
      <div className="max-w-3xl mx-auto text-center space-y-1.5">
        {window.map(({ i, line }) => (
          <p
            key={i}
            className={`transition-all duration-200 ${
              i === index
                ? "text-white text-2xl font-semibold drop-shadow"
                : "text-white/45 text-base"
            }`}
          >
            {line.isGap ? "♪" : line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
