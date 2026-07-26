# Sonara — Music Player Desktop (F5 · Enriquecimento + CI)

<p align="center">
  <a href="https://pedroa07.github.io/Sonara/">
    <img src="https://img.shields.io/badge/%E2%AC%87_Baixar_o_Sonara-2E6BE6?style=for-the-badge" alt="Baixar o Sonara" height="42">
  </a>
</p>

**📥 Baixe o app pronto (Windows · macOS · Linux):** [pedroa07.github.io/Sonara](https://pedroa07.github.io/Sonara/)

Scaffold inicial do player de música descrito no PRD (`Sonara_PRD_Arquitetura.docx`).
Stack: **Tauri 2 + React 18 + TypeScript + SQLite (rusqlite)**.

Fases entregues:
- **F0** — estrutura, IPC, schema do banco, esqueleto de telas.
- **F1** — reprodução de áudio real (seek/volume/next-prev/shuffle/repeat), importação
  funcional com as 3 estratégias, e navegação por Músicas / Álbuns / Artistas.
- **F2** — editor de metadados (RF-05) com edição individual e em lote e escrita
  opcional das tags/capa de volta no arquivo (lofty); playlists completas (RF-04):
  criar, adicionar/remover, reordenar (personalizada) e ordenar por
  recente/alfabética/artista/ano.
- **F3** — capas reais extraídas das tags e renderizadas (grade, álbum, fila);
  crossfade/gapless via dois elementos de áudio; ReplayGain (gain por faixa lido
  das tags e aplicado ao volume); temas claro/escuro via CSS variables; e atalhos
  de teclado globais. Configurações persistidas no banco (`setting`).
- **F4** — downloads reais (RF-09/10): o core executa o **yt-dlp** (sidecar) com
  ffmpeg, faz parse do progresso e emite eventos `download-progress` em tempo real;
  ao concluir, importa o arquivo e o **roteia ao destino** escolhido (biblioteca,
  playlist, álbum ou fila). UI com barras de progresso ao vivo e histórico.
- **F5** — busca full-text (FTS5) reconstruída após cada mudança; deduplicação
  (detecção + remoção assistida); enriquecimento de capa/metadados via
  **MusicBrainz + Cover Art Archive** (ureq).
- **CI/CD** — GitHub Actions compila e testa o core Rust + front-end nos três
  sistemas (Linux/macOS/Windows) e um workflow de release com `tauri-action`.

## Estrutura

```
sonara/
├─ src/                     # Front-end React/TS
│  ├─ components/           # Sidebar, PlayerBar, QueuePanel
│  ├─ screens/              # Biblioteca, Playlists, Buscar&Baixar, Downloads, Config
│  ├─ store/                # Estado global (zustand): player/fila
│  ├─ lib/ipc.ts            # Wrapper tipado do invoke() do Tauri
│  └─ types.ts              # Tipos compartilhados com o core
├─ src-tauri/               # Core Rust (Tauri 2)
│  ├─ src/
│  │  ├─ main.rs            # Bootstrap: abre DB, roda migration, registra commands
│  │  ├─ db.rs              # Conexão SQLite gerenciada (Mutex<Connection>)
│  │  ├─ models.rs          # Track/Album/Playlist/ParsedTrack/ImportSuggestion
│  │  ├─ error.rs           # AppError serializável p/ o front-end
│  │  ├─ commands/          # library, import, playback, download
│  │  └─ services/          # metadata (lofty), downloader (yt-dlp/ffmpeg)
│  ├─ migrations/0001_init.sql
│  ├─ Cargo.toml
│  └─ tauri.conf.json
└─ package.json
```

## Mapa requisito → código

| Requisito | Onde |
|---|---|
| RF-01 Importação/metadados | `services/metadata.rs`, `commands/import.rs::parse_files/import_tracks` |
| RF-02 Hierarquia de pastas | `commands/import.rs::scan_folder` (+ 3 estratégias na UI) |
| RF-03 Biblioteca/busca | `commands/library.rs`, `screens/LibraryScreen.tsx` |
| RF-04 Playlists | `commands/playlists.rs`, `screens/PlaylistsScreen.tsx`, `components/AddToPlaylist.tsx` |
| RF-05 Editor de metadados | `commands/edit.rs`, `services/metadata.rs` (write_tags/embed_cover), `components/TrackEditor.tsx` |
| RF-06 Fila | `commands/playback.rs`, `store/usePlayerStore.ts` |
| RF-07 Reprodutor | `components/PlayerBar.tsx` |
| RF-08 Layouts alternáveis | `App.tsx` + `usePlayerStore.layout` |
| F3 Capas | `services/metadata.rs::extract_cover_to`, `components/CoverArt.tsx` |
| F3 Crossfade/ReplayGain | `components/PlayerBar.tsx` (dois <audio>), coluna `track.gain` |
| F3 Temas/atalhos | `styles.css` + `tailwind.config.js`, `hooks/useKeyboardShortcuts.ts`, `store/useSettingsStore.ts` |
| F6 Auto-update | `hooks/useAutoUpdate.ts`, `components/UpdateBanner.tsx`, `plugins.updater` na conf, `release.yml` |
| RF-09/10 Download | `commands/download.rs` (`start_download` spawn + eventos + finalize/roteamento), `services/downloader.rs`, `store/useDownloadsStore.ts`, `screens/SearchDownloadScreen.tsx`, `screens/DownloadsScreen.tsx` |
| F5 Busca FTS5 | `commands/search.rs` (reindex), `commands/library.rs::search_library` |
| F5 Deduplicação | `commands/maintenance.rs`, `components/DuplicatesModal.tsx` |
| F5 Enriquecimento | `services/enrich.rs`, `commands/enrich.rs`, botão no `AlbumModal` |

## Pré-requisitos

- Node.js 18+
- Rust (stable) + toolchain do Tauri 2 — ver https://v2.tauri.app/start/prerequisites/
- `yt-dlp` e `ffmpeg` como **sidecars**: coloque os binários em `src-tauri/binaries/`
  com o sufixo do target-triple exigido pelo Tauri, ex.:
  `yt-dlp-x86_64-pc-windows-msvc.exe`, `ffmpeg-x86_64-pc-windows-msvc.exe`
  (ou `-x86_64-unknown-linux-gnu`, `-aarch64-apple-darwin`). Declarados em
  `tauri.conf.json > bundle.externalBin` e liberados em `capabilities/default.json`.

## Rodar

```bash
npm install
npm run app:dev      # abre a janela do Tauri em modo dev
```

Somente o front-end (no navegador, sem os commands do Rust):

```bash
npm run dev          # http://localhost:1420
```

## Build de produção

```bash
npm run app:build    # gera o instalador por plataforma
```

## Verificação

- Schema SQLite: roda limpo (`0001_init.sql`).
- Front-end: `tsc --noEmit` passa sem erros.
- Core Rust: não é compilado neste pacote (requer toolchain Rust/Tauri local);
  a escrita de tags usa a API do `lofty` 0.21 (`save_to_path` + `WriteOptions`).

## Integração contínua

- `.github/workflows/ci.yml` — em cada push/PR, compila `cargo build` + `cargo test`
  e `tsc`/`vite build` em Linux, macOS e Windows (fecha a verificação do build Rust).
- `.github/workflows/release.yml` — em tags `v*`, baixa o sidecar `yt-dlp` e gera
  os instaladores com `tauri-action`.

Todas as fases do roadmap do PRD (F0–F5) estão implementadas, além de
**auto-atualização** (updater do Tauri com verificação na inicialização e entrega
via release assinado). Ver `BUILD.md` para os passos de geração de chave.
