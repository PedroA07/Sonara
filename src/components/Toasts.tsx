import { useToastStore, type ToastTone } from "../store/useToastStore";
import { IconClose } from "./icons";

const TONE: Record<ToastTone, { ring: string; icon: JSX.Element }> = {
  success: {
    ring: "border-success/35",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success">
        <circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </svg>
    ),
  },
  error: {
    ring: "border-danger/35",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
        <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.2v.1" />
      </svg>
    ),
  },
  info: {
    ring: "border-brand/35",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.8v.1" />
      </svg>
    ),
  },
};

/** Bottom-right stack of transient messages. Lives above the player bar so it
 *  never covers the transport controls. */
export default function Toasts() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-24 z-[60] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))]" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`bg-elev border ${TONE[t.tone].ring} rounded-xl shadow-lift px-4 py-3 flex gap-3 animate-slide-in-right`}
        >
          <span className="mt-0.5 shrink-0">{TONE[t.tone].icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-content">{t.title}</div>
            {t.description && <div className="text-xs text-muted mt-0.5 break-words">{t.description}</div>}
            {t.action && (
              <button
                onClick={() => { t.action!.run(); dismiss(t.id); }}
                className="mt-2 text-xs font-medium text-brand hover:underline"
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dispensar"
            className="text-muted hover:text-content shrink-0 -mt-0.5 -mr-1 p-1 rounded"
          >
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
