import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LyricsKind } from "../types";
import { api } from "../lib/ipc";

/**
 * Quais faixas de uma lista já têm letra, e de que tipo.
 *
 * Uma consulta só para a lista inteira, em vez de carregar a letra de cada
 * faixa para descobrir se ela existe — a Biblioteca chega a mostrar centenas de
 * linhas de uma vez.
 *
 * Devolve um `Map` vazio enquanto carrega, e faixas sem letra simplesmente não
 * aparecem nele: o ícone é a exceção, não a regra.
 */
export function useLyricsStatus(trackIds: number[]): Map<number, LyricsKind> {
  const [status, setStatus] = useState<Map<number, LyricsKind>>(new Map());
  // Chave estável: só refaz a consulta quando o conjunto de ids muda de fato,
  // e não a cada re-render que recria o array.
  const key = trackIds.join(",");

  useEffect(() => {
    let alive = true;
    const ids = key ? key.split(",").map(Number) : [];

    const refresh = () => {
      if (ids.length === 0) { setStatus(new Map()); return; }
      api.lyricsStatus(ids)
        .then((rows) => {
          if (alive) setStatus(new Map(rows.map(([id, kind]) => [id, kind as LyricsKind])));
        })
        .catch(() => {});
    };
    refresh();

    // A letra pode chegar sozinha — busca automática ao baixar, busca em lote.
    let un: (() => void) | undefined;
    listen("lyrics-changed", refresh).then((f) => { un = f; }).catch(() => {});
    return () => { alive = false; un?.(); };
  }, [key]);

  return status;
}
