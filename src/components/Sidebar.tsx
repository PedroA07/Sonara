import type { ComponentType } from "react";
import type { Screen } from "../types";
import { IconLibrary, IconPlaylists, IconSearch, IconDownload, IconSettings } from "./icons";

const ITEMS: { key: Screen; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { key: "library", label: "Biblioteca", Icon: IconLibrary },
  { key: "playlists", label: "Playlists", Icon: IconPlaylists },
  { key: "search", label: "Buscar & Baixar", Icon: IconSearch },
  { key: "downloads", label: "Downloads", Icon: IconDownload },
  { key: "settings", label: "Configurações", Icon: IconSettings },
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
            <span className="w-5 flex justify-center"><it.Icon size={18} /></span>
            {it.label}
          </button>
        ))}
      </nav>
      <div className="px-5 py-4 text-xs text-muted">v0.1.3 · F0</div>
    </aside>
  );
}
