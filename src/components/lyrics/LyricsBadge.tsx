import type { LyricsKind } from "../../types";
import { IconMusic, IconText } from "../icons";

/**
 * Marca discreta de "esta faixa tem letra", para as listas.
 *
 * Deliberadamente pequena e sem cor forte: numa lista de centenas de linhas, a
 * informação útil é a exceção. Faixa sem letra não desenha nada — um ícone
 * apagado em cada linha viraria ruído de fundo.
 */
export default function LyricsBadge({ kind }: { kind?: LyricsKind }) {
  if (!kind) return <span className="w-[15px]" aria-hidden />;

  if (kind === "instrumental") {
    return (
      <span title="Instrumental — esta faixa não tem letra" aria-label="Instrumental">
        <IconMusic size={13} className="text-muted/70" />
      </span>
    );
  }

  const synced = kind === "synced";
  return (
    <span
      title={synced ? "Letra sincronizada — acompanha a música" : "Letra sem sincronia"}
      aria-label={synced ? "Letra sincronizada" : "Letra sem sincronia"}
    >
      <IconText size={13} className={synced ? "text-brand" : "text-muted/70"} />
    </span>
  );
}
