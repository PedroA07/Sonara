import { defineConfig } from "vitest/config";

// Ambiente node de propósito: os testes cobrem a lógica pura da letra
// (busca da linha ativa, navegação por refrão, validação de LRC), que não
// depende de DOM. Um jsdom aqui só somaria tempo de execução.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
