import { fileUrl } from "../lib/ipc";

/** Renders a real cover image when available, else a branded placeholder that
 *  still reads as album art (not an empty grey box). */
export default function CoverArt({
  path, size = "md", className = "",
}: {
  path?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const rounded = size === "lg" ? "rounded-2xl" : size === "sm" ? "rounded-lg" : "rounded-xl";

  if (path) {
    return (
      <img
        src={fileUrl(path)}
        alt=""
        loading="lazy"
        className={`object-cover w-full h-full bg-panel2 ${rounded} ${className}`}
      />
    );
  }

  return (
    <div
      className={`w-full h-full ${rounded} bg-panel2 flex items-center justify-center overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" className="w-1/2 h-1/2 opacity-30">
        <defs>
          <linearGradient id="cover-ph" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--c-brand))" />
            <stop offset="100%" stopColor="rgb(var(--c-brand2))" />
          </linearGradient>
        </defs>
        <g stroke="url(#cover-ph)" strokeWidth="3.6" strokeLinecap="round">
          <path d="M12 24v0" /><path d="M19 18v12" /><path d="M26 13v22" /><path d="M33 20v8" />
        </g>
      </svg>
    </div>
  );
}
