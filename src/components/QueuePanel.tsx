import { usePlayerStore } from "../store/usePlayerStore";
import CoverArt from "./CoverArt";

export default function QueuePanel({ showArt }: { showArt: boolean }) {
  const { queue, currentIndex } = usePlayerStore();
  const current = queue[currentIndex];
  return (
    <aside className="w-72 shrink-0 bg-panel border-l border-black/40 flex flex-col">
      {showArt && (
        <div className="p-4">
          <div className="aspect-square"><CoverArt size="lg" path={current?.cover_path} /></div>
        </div>
      )}
      <div className="px-4 py-3 text-sm font-semibold text-content">Fila</div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
        {queue.length === 0 && <p className="px-2 text-sm text-muted">A fila está vazia.</p>}
        {queue.map((t, i) => (
          <div
            key={t.id}
            className={`px-3 py-2 rounded-lg text-sm truncate ${
              i === currentIndex ? "bg-brand/20 text-content" : "text-muted hover:bg-white/5"
            }`}
          >
            {t.title}
          </div>
        ))}
      </div>
    </aside>
  );
}
