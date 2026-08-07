# PLANO — Sonara 0.3.0 (letras · vídeo · site)

Levantamento feito antes de escrever código. **Aguardando aprovação para iniciar a Fase 1.**

## 1. Schema real ≠ schema da especificação

A spec usa `tracks`; a tabela real é **`track`** (singular) — assim como todas as outras:
`track`, `album`, `artist`, `track_artist`, `playlist`, `playlist_item`, `queue_item`,
`download_job`, `setting`, `track_fts`. Correções que vou aplicar:

| Spec | Real |
|---|---|
| `tracks(id)` | `track(id)` |
| `tracks.video_path` | `track.video_path` |
| tabela de settings | `setting (key TEXT PK, value TEXT)`, via `get_settings` / `set_setting` |

- Migrations rodam por `PRAGMA user_version` em `db.rs`, hoje em **5** → as novas serão
  **0006_lyrics.sql** e **0007_video.sql**, como previsto.
- `track.duration` é **REAL em segundos**, não ms. Importa para o casamento ±2 s do LRCLIB
  e para converter no limite da API.
- Colunas atuais de `track`: id, title, file_path, duration, track_no, disc_no, year, genre,
  album_id, bitrate, format, date_added, gain (0002), cover_path (0004).

## 2. Bloqueio pré-existente: `cargo clippy -- -D warnings` falha hoje

Dois erros de `dead_code` — `struct Album` e `struct Playlist` em `models.rs` nunca são
construídas. Nada a ver com esta release, mas impede o critério de verde. **Proposta:** um
commit de limpeza no início do PR 1 (remover ou marcar as structs), para a barra ficar
verde desde a primeira fase.

## 3. Desvio de dependência que peço para confirmar

A spec pede **reqwest**. O core já faz HTTP com **ureq** (`services/enrich.rs`, MusicBrainz),
API blocking, que é o padrão da casa. Trocar traria tokio + hyper + rustls sem ganho.
**Vou usar `ureq`**, salvo objeção sua. `lofty 0.21` já traz `sync_text.rs` (SYLT) e as
ItemKeys de USLT/Vorbis/MP4 — cadeia do ADR-04 é viável sem dep nova.

Novas devDeps inevitáveis: **vitest** e **@playwright/test** — hoje não há nenhum runner de
teste JS no projeto (`package.json` só tem dev/build/preview/tauri).

## 4. Conflito real entre ADR-02 e o player atual

O `PlayerBar` faz crossfade com **dois `<audio>`** (slot0/slot1, preload da próxima faixa).
O ADR-02 diz "só um backend por vez". Os dois não podem valer ao mesmo tempo.
**Proposta:** o par de elementos vira detalhe interno do `AudioBackend` (que segue fazendo
crossfade); `VideoBackend` é elemento único; a regra "um backend ativo" passa a valer entre
*backends*, não entre elementos. Crossfade fica desativado em modo vídeo, como a spec já manda.

Impacto do ADR-01: hoje o relógio é `currentTime` em **segundos**. Migrar para `positionMs`
toca `usePlayerStore`, `PlayerBar`, `NowPlaying`, `QueuePanel` e os atalhos — refatoração
real, contida no PR 4, não um rename.

## 5. Ponto de conformidade sobre as fixtures

Os testes do parser de LRC vão usar **texto inventado**, nunca letra real de música. Fixture
com letra comercial significaria versionar material protegido no repositório.

## 6. Ordem que vou seguir

| PR | Branch | Entrega |
|---|---|---|
| 0 | `chore/clippy-baseline` | Zerar os 2 erros de clippy (pode entrar dentro do PR 1) |
| 1 | `feat/lyrics-core` | 0006, parser LRC, detecção de refrão, commands, testes. Sem UI |
| 2 | `feat/lyrics-ui` | NowPlaying com abas, rolagem, editor, mini-letra, atalhos, estados |
| 3 | `feat/lyrics-provider` | LRCLIB, cache negativo, busca em lote, Configurações |
| 4 | `feat/video-mode` | 0007, `MediaBackend`, `positionMs`, download de vídeo, diagnóstico de codec |
| 5 | `chore/site-docs` | Script de prints, landing page, `/ajuda`, README/CHANGELOG, bump 0.3.0 |

## 7. Pendência herdada (fora do meu alcance)

A **v0.2.0 ainda não tem instaladores** — a release foi apagada e a tag `v0.2.0` aponta para
`0b189b2`, 5 commits atrás do `main`, sem o `workflow_dispatch`. A 0.3.0 empilha em cima
disso. Vale recriar a tag sobre o `main` antes de começar. Não consigo fazer daqui: a sessão
bloqueia qualquer escrita no GitHub (tag, release, dispatch).

## 8. Perguntas que mudam o que eu faço

1. `ureq` em vez de `reqwest` — ok?
2. A limpeza do clippy entra no PR 1 ou vira PR próprio?
3. A migração `currentTime` → `positionMs` fica no PR 4 (junto do vídeo, onde ela é
   necessária) ou vem antes, isolada, para reduzir o tamanho daquele PR?
