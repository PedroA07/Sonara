/** @type {import('tailwindcss').Config} */
// Colors reference CSS variables so a single [data-theme] switch re-skins the
// whole app without touching component classes (F3 theming).
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: c("--c-brand"),
        ink: c("--c-ink"),
        panel: c("--c-panel"),
        panel2: c("--c-panel2"),
        muted: c("--c-muted"),
        content: c("--c-content"),
      },
    },
  },
  plugins: [],
};
