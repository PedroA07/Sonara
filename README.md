# Sonara

<p align="center">
  <a href="https://pedroa07.github.io/Sonara/">
    <img src="https://img.shields.io/badge/%E2%AC%87_Baixar_o_Sonara-7C5CFF?style=for-the-badge" alt="Baixar o Sonara" height="42">
  </a>
</p>

**Player de música para computador com download integrado.** Pesquise pelo nome,
baixe com capa e informações já preenchidas, organize a biblioteca e **exporte
para o pendrive, o celular ou o som do carro**.

**📥 Baixe o app pronto (Windows · macOS · Linux):** [pedroa07.github.io/Sonara](https://pedroa07.github.io/Sonara/)

Stack: **Tauri 2 + React 18 + TypeScript + SQLite (rusqlite)**.

> Use o app para conteúdo que você tem o direito de baixar — suas próprias
> gravações, obras de domínio público, material com licença livre ou autorizado
> pelo titular. Respeite os direitos autorais e os termos de uso dos serviços.

---

## O que ele faz

| | |
|---|---|
| **Buscar & Baixar** | Busca do YouTube dentro do app, com prévia em vídeo antes de baixar. Progresso ao vivo, com velocidade, tempo restante e cancelamento. |
| **Exportar** | Copia as músicas para qualquer pasta — pendrive, cartão SD, celular. Organiza por artista/álbum, renomeia pelo padrão escolhido, converte para MP3 e gera `.m3u8`. |
| **Biblioteca** | Músicas, álbuns, artistas e gêneros. Seleção múltipla com ações em lote (tocar, exportar, editar, remover). |
| **Editor** | Título, artista, álbum, gênero, ano, nº da faixa e capa (com recorte) — de uma faixa ou de várias, gravando ou não nas tags do arquivo. |
| **Player** | Fila, playlists, aleatório, repetir, crossfade/gapless, equalização de volume (ReplayGain) e atalhos de teclado. |
| **Manutenção** | Busca full-text (FTS5), detecção de duplicatas e enriquecimento de capas via MusicBrainz / Cover Art Archive. |
| **Auto-update** | Verifica novas versões na inicialização e instala com um clique. |

## Novidades da 0.2.0

**Downloads voltaram a funcionar.** As causas eram três, todas no core:

1. `--print` implica `--quiet` no yt-dlp, o que silenciava as linhas de progresso —
   a barra ficava parada em 0% mesmo com o download rodando. Agora o app força
   `--progress` com um `--progress-template` próprio e legível por máquina.
2. O `--ffmpeg-location` apontava para `resource_dir()`, que só coincide com a
   pasta do executável no Windows. No macOS e no Linux o ffmpeg não era
   encontrado e **toda extração de áudio falhava**. A busca agora parte do
   executável, com os caminhos alternativos de cada plataforma.
3. O caminho do arquivo final era adivinhado ("essa linha do stdout existe no
   disco?"). Agora vem marcado explicitamente pelo `--print`.

Junto com isso:

- **Exportar músicas para outras pastas** (o recurso pedido): destino livre,
  organização por artista/álbum, template de nome, conversão para MP3, playlist
  `.m3u8` e progresso por arquivo.
- **Pasta de downloads configurável**, agora em `<Música>/Sonara` por padrão em
  vez de uma pasta escondida de dados do app.
- **Formato de áudio configurável**: M4A (padrão), MP3, OPUS ou FLAC.
- **Diagnóstico em Configurações**: mostra se o yt-dlp e o ffmpeg estão presentes
  e se a pasta de downloads é gravável — "não acontece nada" virou uma mensagem
  que diz o que fazer.
- Link de vídeo dentro de playlist (`watch?v=…&list=…`) baixa **uma** música em
  vez da rádio inteira.
- Cancelar downloads, tentar de novo, abrir a pasta e tocar direto do histórico.
- Downloads passam a registrar artista, álbum e capa — aparecem em Artistas e
  Álbuns, não só numa lista solta.
- Nomes de arquivo compatíveis com Windows/FAT32, para exportar sem erro.
- Nova identidade visual, tema claro/escuro/sistema, animações, notificações
  (toasts), estados vazios explicativos e atalhos de teclado documentados.

## Estrutura

```
sonara/
├─ src/                     # Front-end React/TS
│  ├─ components/           # Sidebar, PlayerBar, ExportModal, ui.tsx (design system)
│  ├─ screens/              # Biblioteca, Playlists, Buscar&Baixar, Downloads, Config
│  ├─ store/                # Estado global (zustand): player, downloads, settings, toasts
│  ├─ lib/ipc.ts            # Wrapper tipado do invoke() do Tauri
│  ├─ lib/format.ts         # Formatação compartilhada (duração, datas, artista)
│  └─ types.ts              # Tipos compartilhados com o core
├─ src-tauri/               # Core Rust (Tauri 2)
│  ├─ src/
│  │  ├─ main.rs            # Bootstrap: abre DB, roda migration, registra commands
│  │  ├─ commands/          # library, import, playback, download, export, edit…
│  │  └─ services/          # metadata (lofty), downloader (yt-dlp/ffmpeg), enrich
│  ├─ migrations/           # 0001_init … 0005_download_details
│  └─ tauri.conf.json
└─ docs/index.html          # Página de download (GitHub Pages)
```

## Mapa requisito → código

| Requisito | Onde |
|---|---|
| RF-01 Importação/metadados | `services/metadata.rs`, `commands/import.rs` |
| RF-02 Hierarquia de pastas | `commands/import.rs::scan_folder` (+ 3 estratégias na UI) |
| RF-03 Biblioteca/busca | `commands/library.rs`, `screens/LibraryScreen.tsx` |
| RF-04 Playlists | `commands/playlists.rs`, `screens/PlaylistsScreen.tsx` |
| RF-05 Editor de metadados | `commands/edit.rs`, `components/TrackEditor.tsx` |
| RF-06 Fila | `commands/playback.rs`, `store/usePlayerStore.ts` |
| RF-07 Reprodutor | `components/PlayerBar.tsx`, `components/NowPlaying.tsx` |
| RF-09/10 Download | `commands/download.rs`, `services/downloader.rs`, `screens/SearchDownloadScreen.tsx`, `screens/DownloadsScreen.tsx` |
| **Exportação** | `commands/export.rs`, `components/ExportModal.tsx` |
| F5 Busca FTS5 / duplicatas / capas | `commands/search.rs`, `commands/maintenance.rs`, `services/enrich.rs` |
| F6 Auto-update | `hooks/useAutoUpdate.ts`, `components/UpdateBanner.tsx`, `release.yml` |

## Pré-requisitos (desenvolvimento)

- Node.js 18+
- Rust (stable) + toolchain do Tauri 2 — ver https://v2.tauri.app/start/prerequisites/
- `yt-dlp` e `ffmpeg` como **sidecars**: coloque os binários em `src-tauri/binaries/`
  com o sufixo do target-triple exigido pelo Tauri, ex.:
  `yt-dlp-x86_64-pc-windows-msvc.exe`, `ffmpeg-x86_64-pc-windows-msvc.exe`
  (ou `-x86_64-unknown-linux-gnu`, `-aarch64-apple-darwin`). Declarados em
  `tauri.conf.json > bundle.externalBin` e liberados em `capabilities/default.json`.
  O `release.yml` baixa os binários reais automaticamente ao gerar uma versão.

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

## Testes

```bash
npx tsc --noEmit                                 # front-end
cargo test --manifest-path src-tauri/Cargo.toml  # core
```

Os testes do core cobrem a montagem dos argumentos do yt-dlp, o parse do
progresso e do caminho final, a classificação de links (incluindo a regressão do
`watch?v=…&list=…`), a tradução das mensagens de erro e a sanitização de nomes de
arquivo da exportação.

## Integração contínua

- `.github/workflows/ci.yml` — compila `cargo build` + `cargo test` e `tsc`/`vite build`
  em Linux, macOS e Windows a cada push/PR.
- `.github/workflows/release.yml` — em tags `v*`, baixa os sidecars reais
  (yt-dlp + ffmpeg) e publica os instaladores com `tauri-action`, junto com o
  `latest.json` assinado do auto-update.

Ver `BUILD.md` para os passos de geração da chave de assinatura.
