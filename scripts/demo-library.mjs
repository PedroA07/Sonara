/**
 * Biblioteca-demo dos prints da landing page.
 *
 * **Tudo aqui é inventado.** Nenhum artista, álbum, música ou capa
 * corresponde a obra real: a página é material de divulgação do Sonara, e
 * estampar metadado ou arte de terceiro nela seria usar trabalho alheio para
 * vender o nosso. Os nomes são propositalmente genéricos, e as capas são
 * gradientes gerados por código.
 *
 * Se um print precisar de mais faixas, acrescente aqui — não capture a
 * biblioteca de ninguém.
 */

const ARTISTS = [
  { id: 1, name: "Aurora Fria", album_count: 2 },
  { id: 2, name: "Bloco do Meio-Dia", album_count: 1 },
  { id: 3, name: "Casa de Vidro", album_count: 1 },
  { id: 4, name: "Duna Elétrica", album_count: 1 },
  { id: 5, name: "Estrada Comprida", album_count: 1 },
];

const ALBUMS = [
  { id: 1, title: "Manhã de Segunda", year: 2023, artist_name: "Aurora Fria", track_count: 4 },
  { id: 2, title: "Sinal Fechado", year: 2021, artist_name: "Aurora Fria", track_count: 3 },
  { id: 3, title: "Marcha Curta", year: 2024, artist_name: "Bloco do Meio-Dia", track_count: 3 },
  { id: 4, title: "Reflexo", year: 2022, artist_name: "Casa de Vidro", track_count: 3 },
  { id: 5, title: "Areia Quente", year: 2020, artist_name: "Duna Elétrica", track_count: 3 },
  { id: 6, title: "Quilômetro 40", year: 2019, artist_name: "Estrada Comprida", track_count: 2 },
];

const TITLES = [
  ["Café Sem Açúcar", 214, "MPB"], ["Janela do Ônibus", 189, "MPB"],
  ["Segunda de Novo", 247, "MPB"], ["Volta pra Casa", 202, "MPB"],
  ["Sinal Fechado", 176, "Rock"], ["Buzina", 158, "Rock"], ["Faixa Amarela", 231, "Rock"],
  ["Marcha Curta", 195, "Samba"], ["Meio-Dia em Ponto", 168, "Samba"], ["Confete Velho", 223, "Samba"],
  ["Reflexo", 258, "Eletrônica"], ["Vidro Fosco", 241, "Eletrônica"], ["Prédio Vazio", 205, "Eletrônica"],
  ["Areia Quente", 187, "Eletrônica"], ["Sol a Pino", 219, "Eletrônica"], ["Sombra Curta", 234, "Eletrônica"],
  ["Quilômetro 40", 263, "Sertanejo"], ["Posto de Gasolina", 198, "Sertanejo"],
  ["Chuva na Estrada", 210, "Sertanejo"], ["Retrovisor", 182, "Sertanejo"],
];

/** Distribui as faixas entre os álbuns, na ordem em que foram escritas. */
const ALBUM_OF = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6];

export const TRACKS = TITLES.map(([title, duration, genre], i) => {
  const album = ALBUMS.find((a) => a.id === ALBUM_OF[i]);
  return {
    id: i + 1,
    title,
    file_path: `/demo/${ALBUM_OF[i]}/${i + 1}.m4a`,
    duration,
    track_no: i + 1,
    disc_no: 1,
    year: album.year,
    genre,
    album_id: album.id,
    bitrate: 256,
    format: "m4a",
    gain: null,
    cover_path: `/demo/cover/${album.id}.png`,
    artist_name: album.artist_name,
    album_title: album.title,
    // Só uma faixa tem vídeo: é o print do modo vídeo, e mostrar todas com
    // vídeo daria a impressão errada de que o app baixa vídeo sozinho.
    video_path: i === 10 ? "/demo/video/11.mp4" : null,
    video_offset_ms: 0,
  };
});

const covers = ALBUMS.map((a) => ({
  ...a,
  cover_path: `/demo/cover/${a.id}.png`,
}));

const PLAYLISTS = [
  { id: 1, name: "Trabalho sem interrupção", cover_path: "/demo/cover/4.png", description: "Para focar sem letra atrapalhando.", sort_mode: "custom", track_count: 6 },
  { id: 2, name: "Estrada", cover_path: "/demo/cover/6.png", description: "A que vai no pendrive do carro.", sort_mode: "custom", track_count: 5 },
  { id: 3, name: "Domingo de manhã", cover_path: "/demo/cover/1.png", description: null, sort_mode: "alpha", track_count: 4 },
];

const SEARCH_RESULTS = [
  { id: "demo1", title: "Aurora Fria — Café Sem Açúcar (Ao Vivo)", uploader: "Aurora Fria", duration: 231, thumbnail: "/demo/cover/1.png" },
  { id: "demo2", title: "Aurora Fria — Café Sem Açúcar", uploader: "Aurora Fria", duration: 214, thumbnail: "/demo/cover/1.png" },
  { id: "demo3", title: "Café Sem Açúcar (versão acústica)", uploader: "Canal da Aurora", duration: 205, thumbnail: "/demo/cover/2.png" },
  { id: "demo4", title: "Aurora Fria — Manhã de Segunda (álbum completo)", uploader: "Aurora Fria", duration: 852, thumbnail: "/demo/cover/1.png" },
];

const JOBS = [
  { id: 3, url: "https://exemplo/aurora-cafe", type: "video", status: "running", progress: 62.4, dest_kind: "library", dest_id: null, title: "Aurora Fria — Café Sem Açúcar", file_path: null, error: null, track_id: null, created_at: new Date().toISOString() },
  { id: 2, url: "https://exemplo/bloco-marcha", type: "video", status: "done", progress: 100, dest_kind: "playlist", dest_id: 2, title: "Bloco do Meio-Dia — Marcha Curta", file_path: "/demo/3/8.m4a", error: null, track_id: 8, created_at: new Date(Date.now() - 6e5).toISOString() },
  { id: 1, url: "https://exemplo/casa-reflexo", type: "video", status: "done", progress: 100, dest_kind: "library", dest_id: null, title: "Casa de Vidro — Reflexo", file_path: "/demo/4/11.m4a", error: null, track_id: 11, created_at: new Date(Date.now() - 12e5).toISOString() },
];

/** Letra inventada, com tempo, para o print da tela de letra. */
const DEMO_LRC = [
  [8000, "A cidade acorda antes de mim"],
  [12400, "A luz atrás do vidro se acende"],
  [17200, "Conto os andares até o meu"],
  [22000, ""],
  [24500, "E se a manhã de segunda"],
  [28800, "Não pesar como ontem pesou"],
  [33100, "Eu fico mais um pouco aqui"],
  [37400, ""],
  [39900, "E se a manhã de segunda"],
  [44200, "Não pesar como ontem pesou"],
  [48500, "Eu fico mais um pouco aqui"],
];

function lyricsFor(trackId) {
  const lines = DEMO_LRC.map(([startMs, text], i) => ({
    index: i,
    startMs,
    endMs: DEMO_LRC[i + 1]?.[0] ?? startMs + 4300,
    text,
    isChorus: i >= 4 && i <= 6,
    chorusId: i >= 4 && i <= 6 ? 1 : undefined,
    isGap: !text,
  }));
  // Segunda ocorrência do refrão marcada com o mesmo id.
  for (let i = 8; i <= 10; i++) {
    lines[i].isChorus = true;
    lines[i].chorusId = 1;
  }
  return {
    trackId,
    kind: "synced",
    source: "provider",
    provider: "lrclib",
    offsetMs: 0,
    lines,
  };
}

/** Letra pronta por faixa — o script serve isto direto, sem função. */
export const LYRICS_BY_TRACK = Object.fromEntries(
  TRACKS.map((t) => [t.id, lyricsFor(t.id)])
);

/**
 * Respostas do IPC para cada comando que as telas usam.
 *
 * Devolve `undefined` para comando desconhecido, e o script falha alto: um
 * print de tela vazia por causa de comando esquecido é pior que erro.
 */
export const RESPONSES = {
  list_tracks: TRACKS,
  search_library: TRACKS.slice(0, 6),
  list_albums: covers,
  album_tracks: TRACKS.slice(0, 4),
  list_artists: ARTISTS,
  list_playlists: PLAYLISTS,
  playlist_tracks: TRACKS.slice(4, 10),
  get_queue: TRACKS.slice(0, 8),
  set_queue: null,
  list_download_jobs: JOBS,
  youtube_search: SEARCH_RESULTS,
  check_download_tools: {
    ytdlp_version: "2025.06.09",
    ffmpeg_path: "/Applications/Sonara.app/Contents/MacOS/ffmpeg",
    download_dir: "/Users/voce/Música/Sonara",
    download_dir_writable: true,
    audio_format: "m4a",
  },
  get_settings: {
    theme: "dark",
    crossfade: "4",
    replaygain: "true",
    download_dir: "/Users/voce/Música/Sonara",
    audio_format: "m4a",
    lyrics_provider_enabled: "true",
    lyrics_mini_line: "true",
    lyrics_auto_fetch_on_download: "true",
    video_quality: "720p",
  },
  default_paths: { download_dir: "/Users/voce/Música/Sonara" },
  lyrics_status: TRACKS.slice(0, 12).map((t, i) => [t.id, i % 3 === 0 ? "plain" : "synced"]),
  video_storage: {
    totalBytes: 214 * 1024 * 1024,
    items: [
      { trackId: 11, title: "Reflexo", path: "/demo/video/11.mp4", bytes: 96 * 1024 * 1024, height: 720, missing: false },
      { trackId: 8, title: "Marcha Curta", path: "/demo/video/8.mp4", bytes: 71 * 1024 * 1024, height: 720, missing: false },
      { trackId: 1, title: "Café Sem Açúcar", path: "/demo/video/1.mp4", bytes: 47 * 1024 * 1024, height: 720, missing: false },
    ],
  },
  find_duplicates: [],
  rebuild_search_index: null,
  set_setting: null,
};

/**
 * Capa gerada por código: gradiente + as iniciais do álbum.
 *
 * SVG e não arquivo, para o repositório não carregar imagem nenhuma que
 * precise de licença, e para o print continuar reproduzível.
 */
export function coverSvg(albumId) {
  const album = ALBUMS.find((a) => a.id === albumId) ?? ALBUMS[0];
  const hues = [258, 292, 16, 190, 40, 150];
  const h = hues[(albumId - 1) % hues.length];
  const initials = album.title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="hsl(${h} 72% 58%)"/>
    <stop offset="100%" stop-color="hsl(${(h + 48) % 360} 78% 42%)"/>
  </linearGradient></defs>
  <rect width="300" height="300" fill="url(#g)"/>
  <circle cx="228" cy="72" r="86" fill="rgba(255,255,255,.13)"/>
  <text x="28" y="262" font-family="system-ui,sans-serif" font-size="86" font-weight="800"
        fill="rgba(255,255,255,.9)">${initials}</text>
</svg>`;
}
