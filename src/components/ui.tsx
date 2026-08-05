import {
  useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from "react";
import { IconClose } from "./icons";

/* ─────────────────────────── Button ─────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "brand-gradient text-white shadow-glow hover:brightness-110 active:brightness-95 border border-transparent",
  secondary:
    "bg-panel2 text-content border border-line/[.09] hover:bg-elev hover:border-line/20",
  ghost: "bg-transparent text-muted hover:text-content hover:bg-line/[.06] border border-transparent",
  danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
};

export function Button({
  variant = "secondary", size = "md", loading = false, className = "", children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center font-medium whitespace-nowrap
        transition-all duration-150 ease-pop active:scale-[.97]
        disabled:opacity-45 disabled:pointer-events-none
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading && <Spinner size={size === "sm" ? 12 : 14} />}
      {children}
    </button>
  );
}

/** Square icon-only button. `label` is required — it becomes the tooltip and
 *  the accessible name, so no control is ever a mystery glyph. */
export function IconButton({
  label, active = false, className = "", children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150
        active:scale-90 disabled:opacity-40 disabled:pointer-events-none
        ${active ? "text-brand bg-brand/10" : "text-muted hover:text-content hover:bg-line/[.08]"}
        ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ─────────────────────────── Layout ─────────────────────────── */

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`bg-panel border border-line/[.09] rounded-2xl shadow-soft ${className}`}>
      {children}
    </div>
  );
}

/** Page header with a title, a one-line explanation and optional actions. */
export function PageHeader({
  title, subtitle, actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-4 mb-7 animate-fade-up">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-1.5 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

/** Empty states always say what this place is for and offer the next action. */
export function EmptyState({
  icon, title, description, action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6 rounded-2xl border border-dashed border-line/20 animate-fade-in">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="font-semibold text-content">{title}</h3>
      {description && <p className="text-muted text-sm mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({
  tone = "muted", children,
}: {
  tone?: "muted" | "brand" | "success" | "danger" | "warn";
  children: ReactNode;
}) {
  const tones = {
    muted: "bg-line/[.08] text-muted",
    brand: "bg-brand/15 text-brand",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
    warn: "bg-warn/15 text-warn",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ─────────────────────────── Modal ─────────────────────────── */

/** Backdrop + card, closable with Escape, click-outside or the × button.
 *  Traps nothing fancy — it just always offers a visible way out. */
export function Modal({
  title, subtitle, onClose, children, footer, width = "w-[520px]",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`bg-elev border border-line/[.12] rounded-2xl shadow-lift max-w-[94vw] max-h-[88vh]
          flex flex-col outline-none animate-scale-in ${width}`}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
          </div>
          <IconButton label="Fechar" onClick={onClose} className="ml-auto -mr-1 -mt-1">
            <IconClose size={16} />
          </IconButton>
        </div>
        <div className="px-6 pb-2 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 mt-2 border-t divider">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Inputs ─────────────────────────── */

export function TextField({
  label, hint, className = "", ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="text-xs font-medium text-muted">{label}</span>}
      <input
        {...rest}
        className="w-full mt-1.5 h-10 bg-panel2 border border-line/[.09] rounded-xl px-3 text-sm
          placeholder:text-muted/70 outline-none transition
          focus:border-brand/60 focus:ring-2 focus:ring-brand/25"
      />
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

/** Segmented control — the app's one way of picking between a few options. */
export function Segmented<T extends string>({
  value, options, onChange, size = "md",
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2.5 h-7 text-xs" : "px-3.5 h-9 text-sm";
  return (
    <div className="inline-flex p-1 gap-1 bg-panel2 rounded-xl border border-line/[.07]" role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-all duration-150 ${pad}
              ${on ? "bg-elev text-content shadow-soft" : "text-muted hover:text-content"}`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0
        ${checked ? "brand-gradient" : "bg-line/20"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ease-pop
          ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

export function Checkbox({
  checked, onChange, label, indeterminate = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  indeterminate?: boolean;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-all duration-150
        ${checked || indeterminate ? "brand-gradient border-transparent text-white" : "border-line/30 hover:border-brand/60"}`}
    >
      {indeterminate ? (
        <span className="w-2 h-0.5 bg-white rounded-full" />
      ) : checked ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 12 5.5 5.5L20 7" />
        </svg>
      ) : null}
    </button>
  );
}

/** Determinate progress bar; `indeterminate` switches to the sweeping stripe. */
export function ProgressBar({
  value, indeterminate = false, className = "",
}: {
  value: number;
  indeterminate?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`h-1.5 rounded-full bg-line/[.12] overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {indeterminate ? (
        <div className="h-full bar-indeterminate" />
      ) : (
        <div
          className="h-full brand-gradient rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      )}
    </div>
  );
}

/** Three dancing bars, shown next to whichever row is currently playing. */
export function Equalizer({ playing = true }: { playing?: boolean }) {
  return (
    <span className={`eq text-brand ${playing ? "" : "paused"}`} aria-hidden="true">
      <i /><i /><i />
    </span>
  );
}
