# Fixtures de letra — texto inventado, de propósito

Todo arquivo `.lrc` e `.txt` deste diretório usa **texto inventado**, escrito
para exercitar o parser. Nenhum deles contém letra de música real.

Isso não é falta de capricho: letra de música é obra protegida. Colar a letra de
uma faixa comercial aqui significaria versionar material de terceiro no
repositório e distribuí-lo em cada clone — inclusive nos binários publicados.

Se você precisar de um caso novo, **escreva um texto seu**. O parser não liga
para o significado das palavras; ele liga para a forma:

| Quer testar | Use um arquivo com |
|---|---|
| timestamps | `[mm:ss]`, `[mm:ss.x]`, `[mm:ss.xx]`, `[mm:ss.xxx]` |
| linha repetida em vários tempos | `[00:10.00][01:04.00]mesmo texto` |
| metadados | `[ti:]`, `[ar:]`, `[al:]`, `[by:]`, `[length:]`, `[offset:]` |
| tempo por palavra | `<mm:ss.xx>` no meio da linha |
| refrão | um bloco de 2+ linhas que reaparece adiante |
| trecho instrumental | linha sem texto, ou vão maior que 6 s |
| codificação | grave em Latin-1, com CRLF, ou com BOM |

Os testes que consomem estes arquivos ficam em `src/services/lyrics.rs` e em
`src/commands/lyrics.rs`.
