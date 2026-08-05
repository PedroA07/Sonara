import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

// Square cover cropper. Receives an image as a data URL (so the canvas export
// is never tainted), lets the user drag/resize a square selection, and returns
// a 512x512 PNG as base64.
export default function CropModal({
  dataUrl, busy, onCancel, onCrop,
}: {
  dataUrl: string;
  busy?: boolean;
  onCancel: () => void;
  onCrop: (pngBase64: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState({ x: 0, y: 0, s: 0 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const clamp = (x: number, y: number, s: number) => ({
    x: Math.max(0, Math.min(x, disp.w - s)),
    y: Math.max(0, Math.min(y, disp.h - s)),
    s,
  });

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.clientWidth, h = img.clientHeight;
    const s = Math.floor(Math.min(w, h) * 0.9);
    setDisp({ w, h });
    setSel({ x: Math.floor((w - s) / 2), y: Math.floor((h - s) / 2), s });
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      setSel((prev) => clamp(e.clientX - drag.current!.dx, e.clientY - drag.current!.dy, prev.s));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disp.w, disp.h]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { dx: e.clientX - sel.x, dy: e.clientY - sel.y };
  };
  const resize = (s: number) => setSel((prev) => clamp(prev.x, prev.y, Math.min(s, disp.w, disp.h)));

  const confirm = () => {
    const img = imgRef.current;
    if (!img || disp.w === 0) return;
    const scale = img.naturalWidth / disp.w; // display px -> source px
    const out = 512;
    const canvas = document.createElement("canvas");
    canvas.width = out; canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sel.x * scale, sel.y * scale, sel.s * scale, sel.s * scale, 0, 0, out, out);
    onCrop(canvas.toDataURL("image/png").split(",")[1]);
  };

  const maxSize = Math.max(40, Math.min(disp.w || 40, disp.h || 40));

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-[3px] flex items-center justify-center z-[60] animate-fade-in" onClick={onCancel}>
      <div className="bg-elev border border-line/[.12] rounded-2xl shadow-lift p-5 max-w-[92vw] animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">Cortar a capa</h3>
        <p className="text-xs text-muted mb-3">Arraste o quadrado para escolher a parte da imagem e ajuste o tamanho abaixo.</p>
        <div className="relative inline-block select-none" style={{ lineHeight: 0 }}>
          <img ref={imgRef} src={dataUrl} onLoad={onImgLoad} alt="" draggable={false}
            className="max-w-[420px] max-h-[50vh] rounded-xl" />
          {sel.s > 0 && (
            <div onMouseDown={startDrag} className="absolute border-2 border-brand cursor-move"
              style={{ left: sel.x, top: sel.y, width: sel.s, height: sel.s, boxShadow: "0 0 0 9999px rgba(0,0,0,.55)" }} />
          )}
        </div>
        <div className="flex items-center gap-3 mt-4 text-sm">
          <span className="text-muted whitespace-nowrap">Tamanho</span>
          <input
            type="range" min={40} max={maxSize} value={sel.s}
            onChange={(e) => resize(Number(e.target.value))}
            aria-label="Tamanho do recorte"
            className="flex-1 track-range"
            style={{ ["--pct" as string]: `${maxSize > 40 ? ((sel.s - 40) / (maxSize - 40)) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" onClick={confirm} loading={busy}>Usar este recorte</Button>
        </div>
      </div>
    </div>
  );
}
