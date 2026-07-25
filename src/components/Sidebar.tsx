import type { Screen } from "../types";

const ITEMS: { key: Screen; label: string; icon: string }[] = [
  { key: "library", label: "Biblioteca", icon: "♫" },
  { key: "playlists", label: "Playlists", icon: "≡" },
  { key: "search", label: "Buscar & Baixar", icon: "⤓" },
  { key: "downloads", label: "Downloads", icon: "↧" },
  { key: "settings", label: "Configurações", icon: "⚙" },
];

export default function Sidebar({
  active,
  onNavigate,
}: {
  active: Screen;
  onNavigate: (s: Screen) => void;
}) {
  return (
    <aside className="w-60 shrink-0 bg-panel border-r border-black/40 flex flex-col">
      <div className="px-5 py-5 text-2xl font-bold text-brand">Sonara</div>
      <nav className="flex-1 px-2 space-y-1">
        {ITEMS.map((it) => (
          <button
            key={it.key}
            onClick={() => onNavigate(it.key)}
            className={`w-full text-left px-4 py-2 rounded-lg flex items-center gap-3 transition
              ${active === it.key ? "bg-panel2 text-content" : "text-muted hover:text-content hover:bg-white/5"}`}
          >
            <span className="w-5 text-center">{it.icon}</span>
            {it.label}
          </button>
        ))}
      </nav>
      <div className="px-5 py-4 text-xs text-muted">v0.1.0 · F0</div>
    </aside>
  );
}
