import { useAutoUpdate } from "../hooks/useAutoUpdate";
import { IconDownload, IconClose } from "./icons";

/** Thin banner shown when a new version is available (auto-update). */
export default function UpdateBanner() {
  const { available, installing, install, dismiss } = useAutoUpdate();
  if (!available) return null;

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 brand-gradient text-white text-sm animate-fade-in relative z-30">
      <IconDownload size={16} className="shrink-0" />
      <span>
        Nova versão disponível: <strong>{available.version}</strong>. Atualize para receber as
        últimas correções.
      </span>
      <button
        onClick={install}
        disabled={installing}
        className="ml-auto px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-50
          font-medium transition-colors shrink-0"
      >
        {installing ? "Instalando…" : "Instalar e reiniciar"}
      </button>
      <button
        onClick={dismiss}
        aria-label="Agora não"
        title="Agora não"
        className="p-1 rounded opacity-80 hover:opacity-100 shrink-0"
      >
        <IconClose size={15} />
      </button>
    </div>
  );
}
