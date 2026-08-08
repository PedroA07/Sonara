import type { ReactNode, SVGProps } from "react";

// Lightweight, dependency-free SVG icon set. Icons inherit the current text
// color (stroke/fill = currentColor), so existing Tailwind text-* classes keep
// working exactly as they did with the previous emoji glyphs.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---- Sidebar / navigation ---- */
export const IconLibrary = (p: IconProps) => (
  <Svg {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Svg>
);
export const IconPlaylists = (p: IconProps) => (
  <Svg {...p}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" /></Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></Svg>
);
export const IconSettings = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>
);

/* ---- Player transport ---- */
// Shuffle: two paths that cross and swap, each ending in its own arrowhead.
// The previous version was a plain X with stray arrows — at 17px it read as a
// "close" glyph rather than "shuffle".
export const IconShuffle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7h3.1c1.4 0 2.7.7 3.5 1.9l.6.9" />
    <path d="M3 17h3.1c1.4 0 2.7-.7 3.5-1.9l4.8-7.2c.8-1.2 2.1-1.9 3.5-1.9H21" />
    <path d="m17.5 3 3.5 3-3.5 3" />
    <path d="m13.9 14.3.6.8c.8 1.2 2.1 1.9 3.5 1.9H21" />
    <path d="m17.5 14 3.5 3-3.5 3" />
  </Svg>
);
export const IconPrev = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none"><path d="M7 5a1 1 0 0 0-1 1v12a1 1 0 0 0 2 0v-4.6l8.4 5.4A1 1 0 0 0 18 18V6a1 1 0 0 0-1.6-.8L8 10.6V6a1 1 0 0 0-1-1z" /></Svg>
);
export const IconNext = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none"><path d="M17 5a1 1 0 0 1 1 1v12a1 1 0 0 1-2 0v-4.6l-8.4 5.4A1 1 0 0 1 6 18V6a1 1 0 0 1 1.6-.8L16 10.6V6a1 1 0 0 1 1-1z" /></Svg>
);
export const IconPlay = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none"><path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></Svg>
);
export const IconPause = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></Svg>
);
// Repeat: a closed loop centred in the box. The old paths ran from y=2 to y=22,
// so the glyph was taller than every other transport icon and looked misaligned
// next to play/next.
export const IconRepeat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12V9.5A3.5 3.5 0 0 1 7.5 6H19" />
    <path d="m16 3 3.5 3L16 9" />
    <path d="M20 12v2.5a3.5 3.5 0 0 1-3.5 3.5H5" />
    <path d="m8 15-3.5 3L8 21" />
  </Svg>
);
// Repeat one: the same loop with a "1" in the middle — clearer than the dot it
// used to draw, which was easy to mistake for a bullet.
export const IconRepeatOne = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12V9.5A3.5 3.5 0 0 1 7.5 6H19" />
    <path d="m16 3 3.5 3L16 9" />
    <path d="M20 12v2.5a3.5 3.5 0 0 1-3.5 3.5H5" />
    <path d="m8 15-3.5 3L8 21" />
    <path d="M10.9 10.7 12.4 9.8v4.6" strokeWidth={2.2} />
  </Svg>
);
export const IconVolume = (p: IconProps) => (
  <Svg {...p}><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" /></Svg>
);

/* ---- Misc actions ---- */
export const IconEdit = (p: IconProps) => (
  <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>
);
export const IconChevronUp = (p: IconProps) => (
  <Svg {...p}><path d="m6 15 6-6 6 6" /></Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></Svg>
);
export const IconQueue = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="14" y1="4" x2="14" y2="20" /></Svg>
);
export const IconFolder = (p: IconProps) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
);
/** Export = a file leaving the app towards another folder/device. */
export const IconExport = (p: IconProps) => (
  <Svg {...p}><path d="M12 15V3" /><path d="m8 7 4-4 4 4" /><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></Svg>
);
export const IconUsb = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="20" r="2" /><path d="M12 18V6" /><path d="m9 9 3-6 3 6" /><path d="M12 14l4.5-3v-2" /><circle cx="16.5" cy="8" r="1.2" fill="currentColor" stroke="none" /><path d="M12 12 7.5 9V7" /><rect x="6" y="4.6" width="3" height="2.6" rx=".6" /></Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="m4 12 5.5 5.5L20 7" /></Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.2v.1" /></Svg>
);
export const IconLink = (p: IconProps) => (
  <Svg {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" /></Svg>
);
export const IconMusic = (p: IconProps) => (
  <Svg {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Svg>
);
export const IconSparkle = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="M12 8.5 13.4 11 16 12l-2.6 1L12 15.5 10.6 13 8 12l2.6-1z" fill="currentColor" stroke="none" /></Svg>
);
export const IconGrid = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>
);
export const IconList = (p: IconProps) => (
  <Svg {...p}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3.5" y1="6" x2="3.6" y2="6" /><line x1="3.5" y1="12" x2="3.6" y2="12" /><line x1="3.5" y1="18" x2="3.6" y2="18" /></Svg>
);
/** Letra: linhas de texto de comprimentos diferentes, como versos. */
export const IconText = (p: IconProps) => (
  <Svg {...p}><path d="M4 6h16" /><path d="M4 11h11" /><path d="M4 16h13" /><path d="M4 21h7" /></Svg>
);
/* ---- Modo vídeo ---- */
/** Vídeo: uma tela com o triângulo de play, que é como a aba se apresenta. */
export const IconVideo = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" /></Svg>
);
/** Tela cheia: quatro cantos abrindo para fora. */
export const IconFullscreen = (p: IconProps) => (
  <Svg {...p}><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" /><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" /><path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" /></Svg>
);
/** Sair da tela cheia: os mesmos cantos, apontando para dentro. */
export const IconExitFullscreen = (p: IconProps) => (
  <Svg {...p}><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4" /><path d="M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4" /><path d="M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20" /><path d="M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" /></Svg>
);
/** Picture-in-picture: a janelinha destacada no canto. */
export const IconPip = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="3" /><rect x="12" y="11" width="7" height="5.5" rx="1.5" fill="currentColor" stroke="none" /></Svg>
);

export const IconStop = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>
);
