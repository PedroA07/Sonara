/** Sonara's mark: a sound wave that rises and falls inside a rounded tile.
 *  Drawn with the brand gradient so the identity travels with the logo — the
 *  same shape is used for the app icon and the download page. */
export default function Logo({ size = 34, withWordmark = false }: { size?: number; withWordmark?: boolean }) {
  const id = "sonara-grad";
  const mark = (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--c-brand))" />
          <stop offset="100%" stopColor="rgb(var(--c-brand2))" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${id})`} />
      <g stroke="#fff" strokeWidth="3.4" strokeLinecap="round" opacity=".96">
        <path d="M13 24v0" />
        <path d="M18.5 18.5v11" />
        <path d="M24 13.5v21" />
        <path d="M29.5 17v14" />
        <path d="M35 21v6" />
      </g>
    </svg>
  );

  if (!withWordmark) return mark;
  return (
    <span className="inline-flex items-center gap-2.5">
      {mark}
      <span className="text-[19px] font-bold tracking-tight brand-text">Sonara</span>
    </span>
  );
}
