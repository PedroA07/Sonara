-- Letras por faixa (E1).
--
-- Uma linha por faixa: a letra é substituída, nunca acumulada — quando a pessoa
-- troca de origem (cola uma manual por cima de uma do provedor), o que valia
-- antes deixa de valer.
--
-- `content` guarda o LRC bruto, não as linhas já divididas. Assim o parser pode
-- evoluir (mais formatos, melhor detecção de refrão) e a letra que já está no
-- banco passa a se beneficiar sem precisar de nova migração nem nova busca.
CREATE TABLE IF NOT EXISTS lyrics (
  track_id     INTEGER PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
  source       TEXT    NOT NULL,           -- embedded | sidecar | provider | manual
  provider     TEXT,                       -- ex.: 'lrclib'
  provider_id  TEXT,
  kind         TEXT    NOT NULL,           -- synced | plain | instrumental
  content      TEXT    NOT NULL,           -- LRC bruto (ou texto puro)
  lang         TEXT,
  offset_ms    INTEGER NOT NULL DEFAULT 0, -- calibração da pessoa
  fetched_at   INTEGER,
  updated_at   INTEGER NOT NULL
);

-- Cache negativo. Sem isto, uma faixa sem letra dispara uma consulta ao
-- provedor a cada vez que começa a tocar — o que é abuso de um serviço
-- gratuito e deixa a tela de letra lenta à toa.
CREATE TABLE IF NOT EXISTS lyrics_misses (
  track_id   INTEGER PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
  tries      INTEGER NOT NULL DEFAULT 1,
  last_try   INTEGER NOT NULL
);
