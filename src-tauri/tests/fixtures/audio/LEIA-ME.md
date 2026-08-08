# Fixtures de áudio

Arquivos MP3 **gerados por código** (ver o teste que os acompanha), com áudio
silencioso: nenhuma gravação real é versionada aqui.

`id3-tamanho-invalido.mp3` é o caso que motivou tudo isto — um MP3 cujo
cabeçalho ID3 declara um tamanho maior que o próprio arquivo. O `lofty` recusa
o arquivo inteiro, e antes da correção ele sumia da biblioteca em silêncio.
