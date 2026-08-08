/** @type {import('tailwindcss').Config} */
// Colors reference CSS variables so a single [data-theme] switch re-skins the
// whole app without touching component classes. Every value is an RGB triplet
// consumed as `rgb(var(--x) / <alpha-value>)`, which keeps Tailwind's opacity
// modifiers working on semantic tokens (`border-line/60`, `bg-brand/10`).
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: c("--c-brand"),
        brand2: c("--c-brand2"),
        ink: c("--c-ink"),
        panel: c("--c-panel"),
        panel2: c("--c-panel2"),
        elev: c("--c-elev"),
        line: c("--c-line"),
        muted: c("--c-muted"),
        content: c("--c-content"),
        success: c("--c-success"),
        danger: c("--c-danger"),
        warn: c("--c-warn"),
        "lyric-near": c("--c-lyric-near"),
        "lyric-far": c("--c-lyric-far"),
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / 0.16), 0 8px 24px -12px rgb(0 0 0 / 0.35)",
        lift: "0 8px 30px -8px rgb(0 0 0 / 0.45)",
        glow: "0 10px 40px -12px rgb(var(--c-brand) / 0.6)",
      },
      transitionTimingFunction: {
        // Slight overshoot: makes panels and modals feel physical, not linear.
        pop: "cubic-bezier(.2,.9,.3,1.2)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "fade-up": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: 0, transform: "scale(.96)" },
          to: { opacity: 1, transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { opacity: 0, transform: "translateX(16px)" },
          to: { opacity: 1, transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in .22s ease-out both",
        "fade-up": "fade-up .28s cubic-bezier(.2,.9,.3,1) both",
        "scale-in": "scale-in .18s cubic-bezier(.2,.9,.3,1.2) both",
        "slide-in-right": "slide-in-right .24s cubic-bezier(.2,.9,.3,1) both",
      },
    },
  },
  plugins: [],
};
