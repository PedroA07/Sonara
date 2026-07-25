import { fileUrl } from "../lib/ipc";

// Renders a real cover image when available, else a themed placeholder (F3).
export default function CoverArt({
  path, size = "md", className = "",
}: {
  path?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const rounded = size === "lg" ? "rounded-2xl" : "rounded-xl";
  if (path) {
    return (
      <img src={fileUrl(path)} alt="" loading="lazy"
        className={`object-cover w-full h-full ${rounded} ${className}`} />
    );
  }
  return (
    <div className={`w-full h-full ${rounded} bg-panel2 flex items-center justify-center text-muted ${className}`}>
      <span className="text-3xl">♪</span>
    </div>
  );
}
