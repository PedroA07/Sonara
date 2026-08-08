import { useEffect, useState } from "react";
import { subscribePosition, usePlayerStore } from "../store/usePlayerStore";
import { useLyricsStore } from "../store/useLyricsStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { activeLineIndex, isFollowable } from "../lib/lyrics";

/**
 * Linha da letra sendo cantada agora, para a barra do player.
 *
 * Devolve `null` quando o recurso está desligado, quando não há letra
 * sincronizada carregada, ou durante um trecho instrumental — nesses casos a
 * barra volta a mostrar o nome do artista, que é a informação útil ali.
 *
 * Só a **troca de linha** vira estado; a posição é assinada fora do React para
 * não re-renderizar a barra a 60 fps.
 */
export function useMiniLyricLine(): string | null {
  const enabled = useSettingsStore((s) => s.lyricsMiniLine);
  const lyrics = useLyricsStore((s) => s.lyrics);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !isFollowable(lyrics) || !lyrics) {
      setText(null);
      return;
    }
    const lines = lyrics.lines;
    const apply = (positionMs: number) => {
      const line = lines[activeLineIndex(lines, positionMs)];
      const next = line && !line.isGap ? line.text : null;
      setText((prev) => (prev === next ? prev : next));
    };
    apply(usePlayerStore.getState().positionMs);
    return subscribePosition(apply);
  }, [enabled, lyrics]);

  return text;
}
