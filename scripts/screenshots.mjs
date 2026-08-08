/**
 * Gera os prints da landing page — não capture nada à mão.
 *
 * Print feito à mão envelhece: some um botão, muda uma cor, e a página passa a
 * mostrar uma versão do app que não existe mais. Aqui os prints saem do código
 * de produção, com uma biblioteca-demo fictícia (`demo-library.mjs`), e podem
 * ser regerados a qualquer momento — inclusive pelo workflow
 * `.github/workflows/screenshots.yml`.
 *
 *   npm run build
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run screenshots
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coverSvg, LYRICS_BY_TRACK, RESPONSES } from "./demo-library.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "img");
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

/** 1440×900 @2× — o que a maioria vê, em densidade de tela boa. */
const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;
/** Largura final das imagens no site — o dobro disso é só para capturar nítido. */
const TARGET_WIDTH = 1440;

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.error(
    "playwright não está instalado (de propósito: é ferramenta, não dependência do app).\n" +
    "  npm i --no-save playwright && npx playwright install chromium"
  );
  process.exit(1);
}

/**
 * WAV de silêncio, como data URI.
 *
 * Existe para os prints exercitarem o caminho **real** de reprodução: com áudio
 * de verdade o relógio anda, a duração aparece e a letra rola sozinha. Sem
 * isso, a tela de letra sairia parada na primeira linha e a barra de progresso,
 * zerada — um print de um app que não funciona.
 *
 * 4 kHz, 8 bits, mono: qualidade irrelevante, o que importa é a duração.
 */
function silentWavDataUri(seconds = 260) {
  const rate = 4000;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples, 128); // 128 = silêncio em PCM 8 bits
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);  // PCM
  buf.writeUInt16LE(1, 22);  // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples, 40);
  return `data:audio/wav;base64,${buf.toString("base64")}`;
}

/**
 * Um clipe WebM abstrato, gravado pelo próprio navegador.
 *
 * O print do modo vídeo precisa de **alguma** imagem em movimento, e não pode
 * ser um videoclipe de verdade: material de divulgação nosso não estampa obra
 * de terceiro. Um gradiente animado mostra o que interessa — os controles, o
 * enquadramento, a letra por cima — sem usar trabalho de ninguém.
 *
 * Gravado com MediaRecorder em vez de gerado com ffmpeg porque o ffmpeg que
 * acompanha o projeto só é baixado no CI: aqui o Playwright é a única
 * ferramenta necessária.
 *
 * 20 segundos e não 5: em modo vídeo quem manda no relógio é o `<video>`, e um
 * clipe que acaba no meio da captura faz a fila avançar para a faixa seguinte
 * — que não tem vídeo — e o print sai da tela errada.
 */
async function recordDemoClip(browser) {
  const page = await browser.newPage();
  await page.goto("about:blank");
  const b64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(24);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();

    const t0 = performance.now();
    await new Promise((done) => {
      const draw = () => {
        const t = (performance.now() - t0) / 1000;
        const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        // Oscila em torno do roxo/ciano da marca em vez de percorrer o círculo
        // de cores: em 20 s uma deriva constante chegaria no laranja.
        g.addColorStop(0, `hsl(${258 + Math.sin(t * 0.25) * 22} 60% 26%)`);
        g.addColorStop(1, `hsl(${196 + Math.cos(t * 0.2) * 18} 58% 16%)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          const x = canvas.width * (0.2 + 0.15 * i) + Math.sin(t * 0.7 + i) * 90;
          const y = canvas.height * 0.5 + Math.cos(t * 0.5 + i * 1.3) * 130;
          ctx.arc(x, y, 90 + i * 22, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.05 + i * 0.012})`;
          ctx.fill();
        }
        if (t < 20) requestAnimationFrame(draw);
        else done();
      };
      draw();
    });

    rec.stop();
    const blob = await new Promise((r) => { rec.onstop = () => r(new Blob(chunks, { type: "video/webm" })); });
    const buf = await blob.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  });
  await page.close();
  return `data:video/webm;base64,${b64}`;
}

/**
 * IPC falso, injetado antes de qualquer script da página.
 *
 * O front já sabe rodar fora do Tauri (`isDesktop`), mas aí fica sem dados e os
 * prints sairiam de telas vazias. Definindo `__TAURI_INTERNALS__`, o app se
 * comporta exatamente como no desktop — mesmos componentes, mesmos caminhos de
 * código — só que respondendo da biblioteca-demo.
 */
function initScript(payload) {
  return `
  window.__SONARA_DEMO__ = ${JSON.stringify(payload)};
  window.__TAURI_INTERNALS__ = {
    invoke: (cmd, args) => {
      const d = window.__SONARA_DEMO__;
      if (cmd === "lyrics_resolve") {
        return Promise.resolve({
          lyrics: d.lyrics[args?.trackId] ?? d.lyrics[1],
          resolvedFrom: "cache",
          networkSkipped: false,
        });
      }
      if (cmd === "lyrics_get") return Promise.resolve(d.lyrics[args?.trackId] ?? null);
      if (cmd in d.responses) return Promise.resolve(d.responses[cmd]);
      // Comando não previsto: avisa alto, em vez de virar tela vazia no print.
      console.warn("[demo] comando sem resposta:", cmd);
      return Promise.reject("comando de demonstração não mapeado: " + cmd);
    },
    convertFileSrc: (p) => {
      const cover = /\\/demo\\/cover\\/(\\d+)\\.png$/.exec(p);
      if (cover) return "data:image/svg+xml;utf8," + encodeURIComponent(d0().covers[cover[1]]);
      if (/\\.m4a$/.test(p)) return d0().silence;
      if (/\\.mp4$/.test(p)) return d0().clip;
      return p;
    },
    transformCallback: (cb) => { const id = Math.random(); window["_" + id] = cb; return id; },
  };
  function d0() { return window.__SONARA_DEMO__; }
  // O Chromium do Playwright não traz H.264, e o Sonara — com razão — esconde a
  // aba Vídeo quando o sistema não decodifica. Só aqui, na captura, a checagem
  // é atendida: o que o print mostra é a interface real, com um clipe abstrato
  // no lugar do videoclipe.
  HTMLVideoElement.prototype.canPlayType = function () { return "maybe"; };
  `;
}

/** Espera o servidor de preview responder antes de abrir o navegador. */
async function waitForServer(url, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`o servidor não respondeu em ${url}`);
}

const wait = (page, ms) => page.waitForTimeout(ms);

async function go(page, menu) {
  await page.getByRole("button", { name: new RegExp(menu, "i") }).first().click();
  await wait(page, 400);
}

async function playFirstTrack(page) {
  await go(page, "Biblioteca");
  // O nome acessível da linha é o próprio título + artista.
  await page.getByRole("button", { name: /Café Sem Açúcar/ }).first().click();
  await wait(page, 700);
}

/** Avança o relógio pelo atalho público (← / → saltam 5 s). */
async function seekSeconds(page, seconds) {
  for (let i = 0; i < Math.round(seconds / 5); i++) {
    await page.keyboard.press("ArrowRight");
  }
  await wait(page, 400);
}

/**
 * As telas capturadas.
 *
 * `prepare` roda dentro da página e leva o app ao estado do print — clicar num
 * item de menu, abrir um modal, selecionar faixas. Manter isso como código, e
 * não como instrução num documento, é o que impede o print de divergir da UI.
 */
const SHOTS = [
  {
    name: "biblioteca",
    alt: "Lista de músicas da biblioteca do Sonara, com capa, título, artista, álbum, gênero e duração de cada faixa.",
    prepare: (p) => go(p, "Biblioteca"),
  },
  {
    name: "albuns",
    alt: "Álbuns da biblioteca em grade de capas, com nome do álbum, artista e número de faixas.",
    prepare: async (p) => { await go(p, "Biblioteca"); await p.getByRole("tab", { name: "Álbuns" }).click(); await wait(p, 400); },
  },
  {
    name: "artistas",
    alt: "Artistas da biblioteca em cartões, cada um com a inicial em círculo colorido e a contagem de álbuns.",
    prepare: async (p) => { await go(p, "Biblioteca"); await p.getByRole("tab", { name: "Artistas" }).click(); await wait(p, 400); },
  },
  {
    name: "playlists",
    alt: "Playlists criadas pelo usuário, com capa, nome, descrição e quantidade de músicas.",
    prepare: (p) => go(p, "Playlists"),
  },
  {
    name: "buscar",
    alt: "Tela de busca e download, com resultados do YouTube listando título, canal e duração, e um botão de baixar em cada um.",
    prepare: async (p) => {
      await go(p, "Buscar");
      const field = p.getByRole("textbox").first();
      await field.fill("aurora fria café sem açúcar");
      await field.press("Enter");
      await wait(p, 700);
    },
  },
  {
    name: "downloads",
    alt: "Tela de downloads, com um download em andamento mostrando barra de progresso e dois já concluídos no histórico.",
    prepare: (p) => go(p, "Downloads"),
  },
  {
    name: "configuracoes",
    alt: "Tela de configurações do Sonara, com pasta de downloads, formato do arquivo e o diagnóstico das ferramentas.",
    prepare: (p) => go(p, "Config"),
  },
  {
    name: "letra",
    alt: "Tela cheia do Sonara mostrando a letra sincronizada: a linha que está sendo cantada aparece destacada e centralizada, com as vizinhas mais apagadas.",
    prepare: async (p) => {
      await playFirstTrack(p);
      await p.keyboard.press("l");
      await wait(p, 800);
      await seekSeconds(p, 40); // no meio do refrão
    },
  },
  {
    name: "video",
    alt: "Modo vídeo do Sonara em tela cheia, com o vídeo ocupando o centro, a letra sobreposta na parte de baixo e os botões de tela cheia e janela flutuante.",
    prepare: async (p) => {
      await go(p, "Biblioteca");
      // A faixa 11 é a única da demonstração com vídeo baixado.
      await p.getByRole("button", { name: /^Reflexo/ }).first().click();
      await wait(p, 700);
      await p.keyboard.press("v");
      await wait(p, 1800);
      // 10 s: já dentro da primeira linha da letra e bem antes do fim do clipe.
      await seekSeconds(p, 10);
    },
  },
  {
    name: "editor",
    alt: "Janela de edição de faixa, com campos para título, artista, álbum, ano, gênero e número da faixa, e a capa ao lado.",
    prepare: async (p) => {
      await go(p, "Biblioteca");
      await p.getByRole("checkbox", { name: /^Selecionar Café/ }).click();
      await p.getByRole("button", { name: /^Editar$/ }).first().click();
      await wait(p, 500);
    },
  },
  {
    name: "diagnostico",
    alt: "Seção de diagnóstico das configurações, listando yt-dlp, ffmpeg, permissão de escrita na pasta e suporte a vídeo H.264, todos marcados como prontos.",
    prepare: async (p) => {
      await go(p, "Config");
      await p.getByText("Diagnóstico").first().scrollIntoViewIfNeeded();
      await wait(p, 400);
    },
  },
  {
    name: "exportar",
    alt: "Janela de exportação, com a escolha da pasta de destino, como organizar as pastas, como nomear os arquivos e as opções de conversão.",
    prepare: async (p) => {
      await go(p, "Biblioteca");
      await p.getByRole("checkbox", { name: /^Selecionar Café/ }).click();
      await p.getByRole("checkbox", { name: /^Selecionar Janela/ }).click();
      await p.getByRole("button", { name: /^Exportar$/ }).first().click();
      await wait(p, 500);
    },
  },
];

/**
 * Reduz e converte os capturados, usando o próprio Chromium como encoder.
 *
 * Os prints saem em 2880×1800 (1440 CSS × 2), o que dá quase 1 MB por PNG —
 * peso demais para uma landing page que precisa carregar rápido. Aqui cada um
 * vira um WebP de 1440 px de largura, com um PNG do mesmo tamanho como
 * alternativa para navegador que não leia WebP.
 *
 * Usar o navegador evita depender de ffmpeg, sharp ou cwebp: a única
 * ferramenta que o script já exige é o Playwright.
 */
async function encodeAll(browser, shots) {
  const page = await browser.newPage();
  await page.goto("about:blank");
  const out = [];

  for (const { name, png } of shots) {
    const encoded = await page.evaluate(async ({ b64, width }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const scale = Math.min(1, width / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const strip = (uri) => uri.slice(uri.indexOf(",") + 1);
      return {
        webp: strip(canvas.toDataURL("image/webp", 0.82)),
        png: strip(canvas.toDataURL("image/png")),
        w: canvas.width,
        h: canvas.height,
      };
    }, { b64: png.toString("base64"), width: TARGET_WIDTH });

    await writeFile(path.join(OUT, `${name}.webp`), Buffer.from(encoded.webp, "base64"));
    await writeFile(path.join(OUT, `${name}.png`), Buffer.from(encoded.png, "base64"));
    out.push({ name, width: encoded.w, height: encoded.h });
  }

  await page.close();
  return out;
}

/**
 * Imagem de compartilhamento (Open Graph), 1200×630.
 *
 * Gerada aqui, e não desenhada num editor, pelo mesmo motivo dos prints: quando
 * o nome ou a cor da marca mudarem, basta rodar o script de novo.
 */
async function renderOgImage(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const logo = await readFile(path.join(ROOT, "docs", "icon.png"));
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    body{width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;
      gap:26px;padding:0 88px;background:#0b0d16;color:#eceef6;
      font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;position:relative;overflow:hidden}
    body::before{content:"";position:absolute;inset:-40% -10% auto -10%;height:760px;
      background:radial-gradient(620px 320px at 26% 0%,rgba(124,92,255,.42),transparent 70%),
                 radial-gradient(560px 300px at 78% 16%,rgba(34,211,238,.26),transparent 70%)}
    .row{display:flex;align-items:center;gap:22px;position:relative}
    img{width:104px;height:104px;border-radius:28px}
    .name{font-size:60px;font-weight:800;letter-spacing:-.03em;
      background:linear-gradient(120deg,#7c5cff,#22d3ee);-webkit-background-clip:text;color:transparent}
    h1{font-size:56px;line-height:1.12;letter-spacing:-.03em;font-weight:800;position:relative;max-width:960px}
    p{font-size:27px;color:#a8b0c6;position:relative;max-width:900px}
  </style>
  <div class="row"><img src="data:image/png;base64,${logo.toString("base64")}"><span class="name">Sonara</span></div>
  <h1>Baixe suas músicas.<br>Leve para onde quiser.</h1>
  <p>Player para computador com download, letra sincronizada e modo vídeo. Grátis e de código aberto.</p>`);
  await page.waitForTimeout(300);
  const png = await page.screenshot();
  await page.close();
  await writeFile(path.join(OUT, "og.png"), png);
  console.log("✓ og.png (1200×630)");
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const payload = {
    responses: RESPONSES,
    lyrics: LYRICS_BY_TRACK,
    covers: Object.fromEntries([1, 2, 3, 4, 5, 6].map((id) => [id, coverSvg(id)])),
    silence: silentWavDataUri(),
    clip: "",  // preenchido depois que o navegador sobe
  };

  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: "ignore",
  });
  const stop = () => server.kill();
  process.on("exit", stop);
  process.on("SIGINT", () => { stop(); process.exit(1); });

  try {
    await waitForServer(BASE);
    const captured = [];
    const browser = await playwright.chromium.launch({
      // Os prints da letra dependem de o áudio realmente tocar.
      args: ["--autoplay-policy=no-user-gesture-required"],
    });

    payload.clip = await recordDemoClip(browser);
    await renderOgImage(browser);

    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        colorScheme: theme,
        locale: "pt-BR",
      });
      await context.addInitScript(initScript(payload));

      for (const shot of SHOTS) {
        const page = await context.newPage();
        page.on("pageerror", (e) => console.warn(`  ! ${shot.name}: ${e.message}`));
        await page.goto(BASE, { waitUntil: "networkidle" });
        // O tema vem do banco falso; aqui ele é forçado para os dois passes.
        await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
        await wait(page, 400);

        await shot.prepare(page);
        await wait(page, 300);
        captured.push({ name: `${shot.name}-${theme}`, png: await page.screenshot() });
        console.log(`✓ ${shot.name}-${theme}`);
        await page.close();
      }
      await context.close();
    }

    const written = await encodeAll(browser, captured);
    await browser.close();
    console.log(`\n${written.length} imagens em docs/img/ (WebP + PNG, ${TARGET_WIDTH}px)`);
    await writeFile(
      path.join(OUT, "sizes.json"),
      JSON.stringify(
        Object.fromEntries(written.map((w) => [w.name, { width: w.width, height: w.height }])),
        null,
        2
      ) + "\n"
    );
  } finally {
    stop();
  }

  await writeFile(
    path.join(OUT, "LEIA-ME.md"),
    "# Prints da landing page\n\n" +
      "Gerados por `npm run screenshots` — **não edite nem substitua à mão**.\n" +
      "Quando a interface mudar, rode o script de novo (ou dispare o workflow\n" +
      "`screenshots` pelo GitHub Actions) em vez de recortar imagem.\n\n" +
      "Os dados que aparecem neles são fictícios (`scripts/demo-library.mjs`):\n" +
      "artistas, álbuns, músicas e capas foram inventados para esta finalidade.\n" +
      "Nenhum metadado ou arte de obra real entra no material de divulgação.\n"
  );
}

await main();
