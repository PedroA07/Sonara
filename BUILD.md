# Sonara — Guia de Build e Verificação

## O que já foi verificado automaticamente

Este scaffold não pôde ser compilado com `cargo` no ambiente de geração (sem toolchain
Rust nem libs de sistema do webkit). Em vez disso, cada camada foi validada por outros meios:

| Camada | Verificação | Resultado |
|---|---|---|
| Front-end (TS/React) | `tsc --noEmit` em todo o projeto | ✅ sem erros |
| Schema do banco | migrações 0001+0002 aplicadas em SQLite real | ✅ tabelas + coluna `gain` |
| **Todas as queries SQL do core** | executadas contra SQLite com dados de amostra; contagem de colunas conferida com os `row mappers` do Rust | ✅ 25/25 OK |
| API do `lofty` 0.21 | conferida na doc oficial (docs.rs) | ✅ (1 correção aplicada) |
| API do `tauri-plugin-shell` | `CommandEvent`/`sidecar`/`spawn` conferidos na doc | ✅ compatível |
| Queries F5 (FTS5, dedupe, reindex) | executadas em SQLite real | ✅ 5/5 OK |
| Testes unitários Rust | `parse_percent`, `classify_input`, `build_ytdlp_args`, `db_to_linear`, `mb_query` | ✅ escritos (rodam no CI) |
| Build Rust nos 3 SOs | GitHub Actions `ci.yml` (`cargo build`+`cargo test`) | ⏳ roda ao dar push |

### Correção aplicada na verificação
`lofty::TagExt::save_to_path` pertence à **tag**, não ao `TaggedFile`. O código de escrita
de tags/capa (`services/metadata.rs`) foi ajustado para chamar `tag.save_to_path(...)` e
importar `TagExt`. A variante `ItemKey::ReplayGainTrackGain` e a assinatura de
`Picture::new_unchecked(PictureType, Some(MimeType), None, Vec<u8>)` foram confirmadas na doc.

## Pré-requisitos para compilar de fato

1. Node.js 18+
2. Rust (stable) + pré-requisitos do Tauri 2 — https://v2.tauri.app/start/prerequisites/
   (no Linux: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, etc.)
3. Binários `yt-dlp` e `ffmpeg` como sidecars em `src-tauri/binaries/` com o sufixo do
   target-triple, ex.: `yt-dlp-x86_64-pc-windows-msvc.exe`, `ffmpeg-x86_64-pc-windows-msvc.exe`.

## Passos

```bash
npm install
npm run app:dev        # janela nativa (dev)
# ou
npm run dev            # só o front no navegador (sem core Rust)
npm run app:build      # instalador de produção
```

## Checklist de verificação após o primeiro `cargo build`

Estes pontos dependem de runtime/ambiente e devem ser testados na sua máquina:

1. `cargo build` em `src-tauri/` compila sem erros (valida lofty/rusqlite/tauri/shell de fato).
2. Importar uma pasta pequena → conferir que artista/álbum/capa aparecem.
3. Editar uma faixa com "gravar nas tags" ligado → reabrir o arquivo e conferir as tags.
4. Baixar um link do YouTube → barra de progresso avança e a faixa entra no destino escolhido.
   - Confirme que os sidecars `yt-dlp`/`ffmpeg` estão em `binaries/` com o triple correto.
5. Trocar tema, crossfade e atalhos — persistem entre reinícios (tabela `setting`).

## Pontos de atenção conhecidos (runtime)

- **ReplayGain**: como `<audio>` limita volume a 1.0, ganhos positivos são "clipados". Para
  normalização real acima de 0 dB, migrar para Web Audio `GainNode` (fase futura).
- **Parsing de progresso do yt-dlp**: baseado nas linhas `[download] xx.x%`. Se o formato
  mudar, ajustar `parse_percent` em `commands/download.rs`.
- **Escopo do asset protocol**: `tauri.conf.json` usa `scope: ["**"]` para dev; restrinja às
  pastas de música do usuário antes de distribuir.
