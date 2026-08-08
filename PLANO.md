# PLANO — Sonara 0.5.0 (letras · vídeo · site)

Registro das decisões desta release e do que se descobriu no caminho. A versão
alvo é **0.5.0**: o `main` já estava em 0.4.0 quando o trabalho começou.

## 1. Schema real ≠ schema da especificação

A spec usa `tracks`; a tabela real é **`track`** (singular) — assim como todas as
outras: `track`, `album`, `artist`, `track_artist`, `playlist`, `playlist_item`,
`queue_item`, `download_job`, `setting`, `track_fts`.

| Spec | Real |
|---|---|
| `tracks(id)` | `track(id)` |
| `tracks.video_path` | `track.video_path` |
| tabela de settings | `setting (key TEXT PK, value TEXT)`, via `get_settings` / `set_setting` |

- Migrations rodam por `PRAGMA user_version` em `db.rs`: **0006_lyrics.sql** e
  **0007_video.sql**.
- `track.duration` é **REAL em segundos**, não ms. Isso tem consequência direta
  no casamento com o provedor de letras — ver §4.

## 2. ADR-02 — resolvido, não reabrir

A spec diz "só um backend por vez"; o player fazia crossfade com **dois
`<audio>`**. Os dois enunciados não podem valer ao pé da letra ao mesmo tempo.

**Decisão: a exclusividade vale entre _backends_, não entre elementos.**

- O par de `<audio>` (slot ativo + slot de pré-carga) virou **detalhe interno do
  `AudioBackend`**. Quem consome o backend vê um `element`, um `currentMs()` e um
  `setVolume()`, e não sabe quantos elementos existem por dentro.
- `VideoBackend` é elemento único. Trocar de modo **destrói** o backend anterior
  — não o silencia —, que é o que o ADR-02 realmente protege: nada de duplo
  decode nem de dois relógios divergindo.
- Crossfade e gapless ficam **desativados em modo vídeo**, de propósito: não há
  como sobrepor duas imagens do jeito que se sobrepõe dois sons.
- Não existe grafo WebAudio no projeto. O ReplayGain sempre foi aplicado em
  `element.volume`, e continua sendo, nos dois backends. Como não há
  `MediaElementSourceNode`, o `WeakMap` previsto no ADR-02 não tem o que
  guardar; introduzir WebAudio agora seria uma mudança de risco próprio, com
  ganho só no caso de ganho positivo (> 0 dB), que hoje é truncado em 1.0. Fica
  registrado como possível trabalho futuro, não como pendência desta release.

O ADR-01 (relógio em `positionMs` no store) foi implementado antes da UI de
letra, de propósito: a letra consome o mesmo relógio, e construí-la sobre
`currentTime` teria significado reescrever auto-follow, clique-para-saltar e
calibração duas vezes.

## 3. Dependência: `ureq`, não `reqwest`

O core já fala HTTP com **ureq** (`services/enrich.rs`, MusicBrainz). Trocar
traria tokio + hyper + rustls sem ganho. Três consequências que o código trata
explicitamente:

1. `ureq` é **síncrono**: toda chamada sai da thread do comando por
   `tauri::async_runtime::spawn_blocking`. A concorrência 2 da busca em lote é um
   **pool de 2 trabalhadores** puxando de uma fila — não `join_all`.
2. `ureq` trata status ≥ 400 como `Err`, então o **`Retry-After` do 429 chega no
   ramo de erro**, e é lá que ele é lido.
3. Um **único `Agent`** em `OnceLock`, com timeouts de conexão e leitura
   configurados, no mesmo desenho do `enrich.rs`.

Novas devDeps: **vitest** e **@playwright/test** — não havia runner de teste JS.

## 4. A armadilha da duração

`track.duration` é REAL em segundos; o LRCLIB responde inteiro. A tolerância de
±2 s é aplicada sobre os **segundos arredondados dos dois lados**. Comparar o
float local com o inteiro remoto produziria falso negativo em qualquer faixa com
fração — que são quase todas.

## 5. Conformidade

- Busca online de letra: **opt-in, desligada por padrão**, com texto em
  Configurações explicando o que é enviado e para onde.
- `User-Agent` identifica cliente e versão; 429 respeita o `Retry-After`.
- **Não redistribuir letras**: exportar `.lrc` é opcional e desmarcado.
- LRCLIB creditado no rodapé da tela de letra.
- Fixtures do parser usam **texto inventado**, nunca letra real de música —
  fixture com letra comercial significaria versionar material protegido no
  repositório. Ver `src-tauri/tests/fixtures/lyrics/LEIA-ME.md`.

## 6. Ordem executada

| PR | Branch | Entrega | Estado |
|---|---|---|---|
| 0 | `chore/clippy-baseline` | Zerar clippy e adicionar `-D warnings` ao CI | mergeado |
| 1 | `feat/lyrics-core` | 0006, parser LRC, detecção de refrão, commands, testes | mergeado |
| 2 | `refactor/position-ms` | Relógio em `positionMs` no store (ADR-01) | mergeado |
| 3 | `feat/lyrics-ui` | NowPlaying com abas, rolagem, editor, mini-letra, atalhos | mergeado |
| 4 | `feat/lyrics-provider` | LRCLIB, cache negativo, busca em lote, Configurações | mergeado |
| 5 | `feat/video-mode` | 0007, `MediaBackend`, download de vídeo, diagnóstico de codec | este |
| 6 | `chore/site-docs` | Prints, landing page, `/ajuda`, README/CHANGELOG, bump 0.5.0 | a fazer |

O PR 0 virou PR próprio (o clippy já falhava no `main` antes desta release, por
duas structs mortas em `models.rs` — removidas, não silenciadas). A refatoração
do relógio foi movida para antes da UI de letra pelo motivo dado em §2.

## 7. Pendência herdada (fora do meu alcance)

A **v0.2.0 continua sem instaladores**. Criar tag, publicar release e disparar
workflow são escritas no GitHub que esta sessão não consegue fazer. Vale recriar
a tag sobre o `main` antes de publicar a 0.5.0.
