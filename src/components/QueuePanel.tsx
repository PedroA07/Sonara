import { usePlayerStore } from "../store/usePlayerStore";
import { artistOf, fmtDuration, fmtTotal } from "../lib/format";
import CoverArt from "./CoverArt";
import { Equalizer, IconButton } from "./ui";
import { IconClose, IconMusic } from "./icons";

/** The queue is the app's "what happens next" — clicking a row jumps to it,
 *  and each row says who the artist is, not just the title. */
export default function QueuePanel({ showArt }: { showArt: boolean }) {
  const { queue, currentIndex, isPlaying, jumpTo, toggleQueue } = usePlayerStore();
  const current = queue[currentIndex];
  const remaining = queue.slice(currentIndex).reduce((sum, t) => sum + (t.duration ?? 0), 0);

  return (
    <aside className="w-[300px] shrink-0 bg-panel border-l divider flex flex-col animate-slide-in-right">
      {showArt && (
        <div className="p-4 pb-2">
          <div className="aspect-square rounded-2xl overflow-hidden shadow-lift">
            <CoverArt size="lg" path={current?.cover_path} />
          </div>
        </div>
      )}

      <div className="px-4 py-3 flex items-center gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Fila</div>
          <div className="text-[11px] text-muted">
            {queue.length === 0
              ? "vazia"
              : `${queue.length} ${queue.length === 1 ? "faixa" : "faixas"} · ${fmtTotal(remaining)} restantes`}
          </div>
        </div>
        <IconButton label="Ocultar a fila (Q)" onClick={toggleQueue} className="ml-auto">
          <IconClose size={15} />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {queue.length === 0 && (
          <div className="px-3 py-8 text-center text-muted">
            <IconMusic size={22} className="mx-auto mb-2 opacity-60" />
            <p className="text-xs leading-relaxed">
              A fila está vazia.<br />Toque uma música na Biblioteca para começar.
            </p>
          </div>
        )}

        {queue.map((t, i) => {
          const isCurrent = i === currentIndex;
          const played = i < currentIndex;
          return (
            <button
              key={`${t.id}-${i}`}
              onClick={() => jumpTo(i)}
              title={`Tocar "${t.title}"`}
              className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center gap-2.5 transition-colors duration-150
                ${isCurrent ? "bg-brand/[.12]" : "hover:bg-line/[.06]"} ${played ? "opacity-55" : ""}`}
            >
              <div className="w-5 shrink-0 flex justify-center">
                {isCurrent ? (
                  <Equalizer playing={isPlaying} />
                ) : (
                  <span className="text-[11px] text-muted tabular-nums">{i + 1}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] truncate ${isCurrent ? "text-content font-medium" : "text-content/90"}`}>
                  {t.title}
                </div>
                <div className="text-[11px] text-muted truncate">{artistOf(t)}</div>
              </div>
              <span className="text-[11px] text-muted tabular-nums shrink-0">{fmtDuration(t.duration)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
