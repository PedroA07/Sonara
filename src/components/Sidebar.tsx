import type { ComponentType } from "react";
import type { Screen } from "../types";
import { IconLibrary, IconPlaylists, IconSearch, IconDownload, IconSettings } from "./icons";
import Logo from "./Logo";
import { useDownloadsStore } from "../store/useDownloadsStore";
import { APP_VERSION } from "../version";

type Item = { key: Screen; label: string; hint: string; Icon: ComponentType<{ size?: number }> };

// Grouped so the sidebar reads as "what I have" then "what I'm getting".
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Minha música",
    items: [
      { key: "library", label: "Biblioteca", hint: "Suas músicas, álbuns e artistas", Icon: IconLibrary },
      { key: "playlists", label: "Playlists", hint: "Suas listas", Icon: IconPlaylists },
    ],
  },
  {
    title: "Descobrir",
    items: [
      { key: "search", label: "Buscar & Baixar", hint: "Pesquise e baixe do YouTube", Icon: IconSearch },
      { key: "downloads", label: "Downloads", hint: "Andamento e histórico", Icon: IconDownload },
    ],
  },
];

const SETTINGS: Item = {
  key: "settings", label: "Configurações", hint: "Pasta, formato e aparência", Icon: IconSettings,
};

export default function Sidebar({
  active, onNavigate,
}: {
  active: Screen;
  onNavigate: (s: Screen) => void;
}) {
  // A live badge on "Downloads" so progress is visible from any screen.
  const running = useDownloadsStore(
    (s) => Object.values(s.jobs).filter((j) => j.status === "running").length
  );

  return (
    <aside className="w-[232px] shrink-0 bg-panel border-r divider flex flex-col">
      <div className="px-5 pt-5 pb-6">
        <Logo size={30} withWordmark />
      </div>

      <nav className="flex-1 px-3 space-y-6 overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted/80">
              {g.title}
            </div>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavButton
                  key={it.key}
                  item={it}
                  active={active === it.key}
                  badge={it.key === "downloads" && running > 0 ? running : undefined}
                  onClick={() => onNavigate(it.key)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-3 pt-2 space-y-0.5">
        <NavButton item={SETTINGS} active={active === "settings"} onClick={() => onNavigate("settings")} />
        <div className="px-3 pt-2 text-[11px] text-muted/70">Sonara {APP_VERSION}</div>
      </div>
    </aside>
  );
}

function NavButton({
  item, active, badge, onClick,
}: {
  item: Item;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={item.hint}
      aria-current={active ? "page" : undefined}
      className={`group relative w-full text-left pl-4 pr-3 py-2.5 rounded-xl flex items-center gap-3 text-sm
        transition-all duration-150
        ${active ? "bg-brand/[.12] text-content font-medium" : "text-muted hover:text-content hover:bg-line/[.05]"}`}
    >
      {/* Active marker — a small brand bar, readable even without colour. */}
      <span
        className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full brand-gradient transition-all duration-200
          ${active ? "h-5 opacity-100" : "h-0 opacity-0"}`}
      />
      <span className={`w-5 flex justify-center transition-colors ${active ? "text-brand" : ""}`}>
        <item.Icon size={18} />
      </span>
      <span className="truncate">{item.label}</span>
      {badge !== undefined && (
        <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full brand-gradient text-white text-[11px] font-semibold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}
