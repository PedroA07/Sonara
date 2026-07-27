import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Track, TrackEdit } from "../types";
import { api } from "../lib/ipc";
import CoverArt from "./CoverArt";
import CropModal from "./CropModal";

// RF-05: edit metadata for one (or several) tracks, optionally writing to file.
export default function TrackEditor({
  tracks, onClose, onSaved,
}: {
  tracks: Track[]; // 1 = single edit, >1 = batch
  onClose: () => void;
  onSaved: () => void;
}) {
  const single = tracks.length === 1 ? tracks[0] : null;
  const [title, setTitle] = useState(single?.title ?? "");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [genre, setGenre] = useState(single?.genre ?? "");
  const [year, setYear] = useState(single?.year?.toString() ?? "");
  const [trackNo, setTrackNo] = useState(single?.track_no?.toString() ?? "");
  const [writeFile, setWriteFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cropData, setCropData] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr("");
    const edit: TrackEdit = {
      // In batch mode leave title empty so it isn't overwritten across tracks.
      title: single && title ? title : undefined,
      artist: artist || undefined,
      album: album || undefined,
      genre: genre || undefined,
      year: year ? Number(year) : undefined,
      track_no: single && trackNo ? Number(trackNo) : undefined,
    };
    try {
      await api.updateTrackMetadata(tracks.map((t) => t.id), edit, writeFile);
      onSaved(); onClose();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  // Pick an image, then open the cropper. The chosen file is read as base64 so
  // the crop canvas isn't tainted by the asset protocol.
  const pickCover = async () => {
    if (!single) return;
    setErr("");
    try {
      const img = await open({ multiple: false, filters: [{ name: "Imagem", extensions: ["jpg", "jpeg", "png", "webp"] }] });
      if (img && typeof img === "string") {
        const b64 = await api.readImageBase64(img);
        const ext = img.split(".").pop()?.toLowerCase();
        const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        setCropData(`data:${mime};base64,${b64}`);
      }
    } catch (e) { setErr(String(e)); }
  };

  const onCropped = async (pngB64: string) => {
    if (!single) return;
    setBusy(true); setErr("");
    try {
      await api.setCoverFromBytes(single.id, pngB64, writeFile);
      setCropData(null);
      onSaved(); onClose();
    } catch (e) { setErr(String(e)); setBusy(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-panel rounded-2xl p-6 w-[480px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-xl font-bold mb-1">Editar {single ? "faixa" : `${tracks.length} faixas`}</h2>
          <p className="text-xs text-muted mb-4">Campos em branco não são alterados.</p>
          <div className="space-y-3">
            {single && <Field label="Título" value={title} onChange={setTitle} />}
            <Field label="Artista" value={artist} onChange={setArtist} placeholder={single ? "(deixe em branco p/ manter)" : "aplicar a todas"} />
            <Field label="Álbum" value={album} onChange={setAlbum} placeholder={single ? "(deixe em branco p/ manter)" : "aplicar a todas"} />
            <div className="flex gap-3">
              <Field label="Gênero" value={genre} onChange={setGenre} />
              <Field label="Ano" value={year} onChange={setYear} />
              {single && <Field label="Nº faixa" value={trackNo} onChange={setTrackNo} />}
            </div>
            {single && (
              <div className="flex items-center gap-3 pt-1">
                <div className="w-14 h-14 shrink-0"><CoverArt path={single.cover_path} /></div>
                <button onClick={pickCover} className="text-sm text-brand hover:underline">Trocar capa (com recorte)…</button>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-muted pt-1">
              <input type="checkbox" checked={writeFile} onChange={(e) => setWriteFile(e.target.checked)} className="accent-brand" />
              Gravar também nas tags do arquivo (APIC/ID3)
            </label>
            {err && <p className="text-red-300 text-sm break-words">{err}</p>}
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-panel2 text-content text-sm">Cancelar</button>
            <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-brand text-content text-sm disabled:opacity-50">
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
      {cropData && <CropModal dataUrl={cropData} busy={busy} onCancel={() => setCropData(null)} onCrop={onCropped} />}
    </>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="flex-1 block">
      <span className="text-xs text-muted">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 bg-panel2 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-brand" />
    </label>
  );
}
