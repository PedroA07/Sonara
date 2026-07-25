import { useAutoUpdate } from "../hooks/useAutoUpdate";

// Thin banner shown when a new version is available (F6 · auto-update).
export default function UpdateBanner() {
  const { available, installing, install, dismiss } = useAutoUpdate();
  if (!available) return null;

  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-brand text-white text-sm">
      <span>
        Atualização disponível — versão <strong>{available.version}</strong>.
      </span>
      <button onClick={install} disabled={installing}
        className="ml-auto px-3 py-1 rounded bg-white/20 hover:bg-white/30 disabled:opacity-50">
        {installing ? "Instalando…" : "Instalar e reiniciar"}
      </button>
      <button onClick={dismiss} className="px-2 opacity-80 hover:opacity-100">Depois</button>
    </div>
  );
}
