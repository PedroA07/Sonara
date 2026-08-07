# Changelog

As notas de cada versão. O workflow de release lê a seção correspondente à tag
e a publica como descrição da release — mantenha o formato dos títulos
(`## [versão] — data`) para que a extração continue funcionando.

---

## [0.4.0] — 2026-08-07

### Prévias ao lado na tela cheia

Na tela "Tocando agora", agora aparecem duas prévias: à **esquerda** a faixa
anterior da fila e à **direita** a próxima. Clique em qualquer uma para pular
direto para ela. Em janelas estreitas elas ficam ocultas e continua valendo a
linha "A seguir" embaixo.

### Álbum preenchido sozinho ao baixar

Ao terminar um download, o Sonara pesquisa a música pelo **nome + artista** num
catálogo musical e preenche o **álbum correto** e o **ano** — no lugar do ano de
upload do vídeo. Só preenche quando o álbum está vazio ou quando o que veio do
YouTube é só uma repetição do artista/título, então informações boas não são
sobrescritas. A capa quadrada do álbum vem na mesma consulta.

---

## [0.3.1] — 2026-08-07

### O app quebrava depois de atualizar

A instalação era feita em `Arquivos de Programas` (para todos os usuários), o que
exige permissão de administrador. O atualizador automático roda o instalador em
segundo plano e **não consegue pedir essa permissão**, então a atualização parava
no meio e deixava o app sem abrir.

Agora o Sonara é instalado **para o seu usuário**, sem pedir administrador — que é
o modo em que a atualização automática funciona de ponta a ponta.

> **Vindo de uma versão anterior:** desinstale o Sonara antigo antes de instalar
> este (Configurações do Windows → Aplicativos → Sonara → Desinstalar), para não
> ficar com duas cópias.

### A janela abria cortada

Em telas menores — ou com o Windows usando escala de 125%/150% — a janela abria
mais alta que a tela, e o topo das janelas de edição ficava cortado. Agora o app
mede a área útil da tela ao abrir e ajusta o tamanho, além de já abrir centralizado.

---

## [0.3.0] — 2026-08-07

### Álbuns e artistas agora podem ser corrigidos

- **Excluir álbum** criado por engano — as músicas continuam na biblioteca, só o
  agrupamento sai.
- **Editar álbum**: nome, artista e ano.
- **Renomear e excluir artistas**, direto na aba Artistas.

### Capas

- **Buscar capa na edição**: o botão “Buscar capa” abre uma grade de imagens de
  referência; clique numa para ver e aplicar como capa da música.
- **Capa automática ao baixar**: depois do download, o app procura a arte
  quadrada do álbum e substitui a miniatura 16:9 do vídeo. Se não achar, fica a
  miniatura de sempre.

### Nome do artista no campo certo

Títulos no formato “Artista - Música” passam a ser separados no download: o
artista vai para o campo Artista e o título fica só com o nome da música.

---

## [0.2.2] — 2026-08-07

### Ajustes de interface

- **Tabela de músicas não corta mais.** As colunas (Álbum, Gênero) agora
  aparecem de forma responsiva, sem deixar espaços vazios que desalinhavam as
  linhas nem espremer o título quando a fila está aberta.
- **Barras de progresso e volume** usam o degradê da marca (violeta → ciano),
  no lugar da cor chapada.

---

## [0.2.1] — 2026-08-07

### Correções no editor de música

- **Janela do editor não fica mais cortada.** O conteúdo agora rola dentro da
  janela quando é mais alto que a tela (o topo, com a capa, ficava escondido).
- **Dá para editar Artista e Álbum de verdade.** Ao trocar o artista, a mudança
  passa a aparecer na biblioteca — antes o app mantinha o artista antigo junto
  do novo e mostrava o errado.

---

## [0.2.0] — 2026-08-06

### Os downloads voltaram a funcionar

Eram três problemas independentes, cada um suficiente para quebrar o download
sozinho:

- **A barra de progresso ficava parada em 0%.** A opção `--print` do yt-dlp
  ativa o modo silencioso, o que apagava as linhas de progresso. O app agora
  força a exibição do progresso num formato próprio.
- **No macOS e no Linux, nenhuma música era convertida.** O app procurava o
  ffmpeg na pasta errada — o caminho só coincidia por acaso no Windows. A busca
  agora parte do próprio executável, cobrindo as três plataformas.
- **O arquivo baixado nem sempre era encontrado.** O caminho final era
  adivinhado; agora o yt-dlp informa exatamente onde gravou.

### Exportar músicas para outras pastas

Novidade: leve suas músicas para um pendrive, cartão SD, celular ou qualquer
pasta do computador.

- Escolha a pasta de destino e como organizar: tudo junto, por artista, ou
  artista com subpastas de álbum
- Renomeie pelo padrão que preferir — título, "Artista - Título" ou "Nº - Título"
- **Converta para MP3** se o aparelho de destino não tocar m4a (rádio de carro,
  aparelhos antigos)
- Gere um arquivo de playlist `.m3u8` junto
- Exporte uma música, uma seleção, um álbum inteiro ou uma playlist
- Os arquivos originais nunca saem do lugar — tudo é cópia

### Mais controle sobre os downloads

- **Pasta de downloads configurável**, agora em `Músicas/Sonara` por padrão, em
  vez de uma pasta escondida do sistema
- **Formato do arquivo à sua escolha**: M4A (padrão, melhor qualidade), MP3
  (compatível com tudo), OPUS (menor) ou FLAC
- **Cancelar** um download em andamento e **tentar de novo** os que falharam
- Velocidade e tempo restante durante o download
- Abrir a pasta ou tocar a música direto do histórico
- Mensagens de erro que dizem o que fazer, em vez de despejar o erro técnico
- **Diagnóstico em Configurações**: verifica o yt-dlp, o ffmpeg e a permissão de
  escrita na pasta, para você saber exatamente o que está faltando

### Interface nova

- Identidade visual própria, com logotipo e paleta redesenhada
- Tema claro, escuro ou seguindo o sistema
- Seleção múltipla na biblioteca, com ações em lote: tocar, exportar, editar e
  remover
- O nome do artista agora aparece nas listas e no player (antes o player
  mostrava o formato do arquivo no lugar do artista)
- Duração no formato `3:42` em vez de `234s`
- Indicador de qual faixa está tocando
- Avisos de conclusão e de erro, em vez de ações que terminavam em silêncio
- Telas vazias que explicam o que fazer ali
- Animações que respeitam a preferência de movimento reduzido do sistema
- Ícones de aleatório e repetir redesenhados
- Atalhos de teclado documentados em Configurações

### Outras correções

- Um link de vídeo dentro de uma playlist (`watch?v=…&list=…`) baixava a rádio
  inteira; agora baixa só a música
- Escolher "baixar para uma playlist" não perguntava **qual** playlist, e a
  faixa era descartada silenciosamente na biblioteca
- Downloads não registravam artista, álbum nem capa — não apareciam em Artistas
  e Álbuns
- Downloads de uma única música criavam uma pasta chamada `NA`
- Nomes de arquivo agora são compatíveis com Windows e pendrives formatados em
  FAT32/exFAT
- Downloads interrompidos ao fechar o app ficavam marcados como "em andamento"
  para sempre
- As releases eram publicadas como rascunho, o que deixava o link de download e
  a atualização automática apontando para uma página inexistente

---

## [0.1.3] — 2026-07-27

- Busca do YouTube dentro do app, sem precisar abrir o navegador
- Mensagens de erro de download mais claras

---

## [0.1.2] — 2026-07-27

- Prévia do clipe embutida na tela de busca, com sugestão de download
- Capas por faixa, com recorte de imagem
- Navegação por gêneros
- Atualização automática ativada
- Tela "tocando agora", capas na biblioteca, tocar com um clique, ocultar a fila
  e remover faixas
- Ícones próprios em SVG no lugar dos emojis, e novo ícone do app
- Instalador do Windows passa a instalar para todos os usuários
- Página de download com prévia do app e instruções por sistema

---

## [0.1.0] — 2026-07-26

Primeira versão distribuída, com os instaladores para Windows, macOS e Linux.
