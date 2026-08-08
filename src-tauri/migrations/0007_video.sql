-- Modo vídeo (E2).
--
-- ADR-05: o vídeo é um arquivo separado, opcional, ligado à faixa. Ele **nunca**
-- substitui o áudio já baixado — quem tem a música continua tendo a música. As
-- colunas ficam em `track` (e não numa tabela `video`) porque a relação é 1:1 e
-- toda leitura de vídeo já vem acompanhada da faixa.
--
-- Se o arquivo sumir do disco, `video_path` aponta para o nada: o app degrada
-- para áudio e oferece baixar de novo, em vez de mostrar uma tela preta.
ALTER TABLE track ADD COLUMN video_path       TEXT;
ALTER TABLE track ADD COLUMN video_source_url TEXT;
ALTER TABLE track ADD COLUMN video_height     INTEGER;
ALTER TABLE track ADD COLUMN video_bytes      INTEGER;

-- Ajuste fino de lipsync por faixa, em ms, somado à posição na troca áudio→vídeo.
-- O mesmo par de teclas `[` e `]` da calibração da letra opera este valor quando
-- o modo vídeo está ativo.
ALTER TABLE track ADD COLUMN video_offset_ms  INTEGER NOT NULL DEFAULT 0;
