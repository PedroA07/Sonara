import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Track, TrackEdit } from "../types";
import { api } from "../lib/ipc";
import { artistOf } from "../lib/format";
import { toast } from "../store/useToastStore";
import CoverArt from "./CoverArt";
import CropModal from "./CropModal";
import { Button, Checkbox, Modal, TextField } from "./ui";
import { IconAlert } from "./icons";

/** RF-05: edit metadata for one (or several) tracks, optionally writing the
 *  tags back into the audio files themselves. */
export default function TrackEditor({
  tracks, onClose, onSaved,
}: {
  tracks: Track[]; // 1 = single edit, >1 = batch
  onClose: () => void;
  onSaved: () => void;
}) {
  const single = tracks.length === 1 ? tracks[0] : null;
  const [title, setTitle] = useState(single?.title ?? "");
  const [artist, setArtist] = useState(single?.artist_name ?? "");
  const [album, setAlbum] = useState(single?.album_title ?? "");
  const [genre, setGenre] = useState(single?.genre ?? "");
  const [year, setYear] = useState(single?.year?.toString() ?? "");
  const [trackNo, setTrackNo] = useState(single?.track_no?.toString() ?? "");
  const [writeFile, setWriteFile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cropData, setCropData] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr("");
    const edit: TrackEdit = {
      // In batch mode leave the title alone so it isn't copied across tracks.
      title: single && title ? title : undefined,
      artist: artist || undefined,
      album: album || undefined,
      genre: genre || undefined,
      year: year ? Number(year) : undefined,
      track_no: single && trackNo ? Number(trackNo) : undefined,
    };
    try {
      await api.updateTrackMetadata(tracks.map((t) => t.id), edit, writeFile);
      toast.success(single ? "Informações salvas" : `${tracks.length} faixas atualizadas`);
      onSaved(); onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  // Pick an image, then open the cropper. The chosen file is read as base64 so
  // the crop canvas isn't tainted by the asset protocol.
  const pickCover = async () => {
    if (!single) return;
    setErr("");
    try {
      const img = await open({
        multiple: false,
        title: "Escolha a imagem da capa",
        filters: [{ name: "Imagem", extensions: ["jpg", "jpeg", "png", "webp"] }],
      });
      if (img && typeof img === "string") {
        const b64 = await api.readImageBase64(img);
        const ext = img.split(".").pop()?.toLowerCase();
        const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        setCropData(`data:${mime};base64,${b64}`);
      }
    } catch (e) {
      setErr(String(e));
    }
  };

  const onCropped = async (pngB64: string) => {
    if (!single) return;
    setBusy(true); setErr("");
    try {
      await api.setCoverFromBytes(single.id, pngB64, writeFile);
      toast.success("Capa atualizada");
      setCropData(null);
      onSaved(); onClose();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        title={single ? "Editar música" : `Editar ${tracks.length} músicas`}
        subtitle={
          single
            ? "Isso muda como a música aparece na sua biblioteca."
            : "Os campos preenchidos são aplicados a todas as faixas selecionadas; os vazios não mudam nada."
        }
        onClose={onClose}
        width="w-[520px]"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button variant="primary" onClick={save} loading={busy}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-3.5 pb-2">
          {single && (
            <div className="flex items-center gap-4 p-3 bg-panel2 rounded-xl">
              <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden shadow-soft">
                <CoverArt path={single.cover_path} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-content truncate">{single.title}</div>
                <div className="text-xs text-muted truncate">{artistOf(single)}</div>
              </div>
              <Button size="sm" onClick={pickCover}>Trocar a capa…</Button>
            </div>
          )}

          {single && <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} />}

          <TextField
            label="Artista" value={artist} onChange={(e) => setArtist(e.target.value)}
            placeholder={single ? "" : "aplicar a todas as selecionadas"}
          />
          <TextField
            label="Álbum" value={album} onChange={(e) => setAlbum(e.target.value)}
            placeholder={single ? "" : "aplicar a todas as selecionadas"}
          />

          <div className="flex gap-3">
            <TextField label="Gênero" value={genre} onChange={(e) => setGenre(e.target.value)} className="flex-1" />
            <TextField label="Ano" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" className="w-28" />
            {single && (
              <TextField label="Nº da faixa" value={trackNo} onChange={(e) => setTrackNo(e.target.value)} inputMode="numeric" className="w-28" />
            )}
          </div>

          <div className="flex gap-3 items-start pt-1 cursor-pointer" onClick={() => setWriteFile(!writeFile)}>
            <div className="mt-0.5">
              <Checkbox checked={writeFile} onChange={setWriteFile} label="Gravar também no arquivo" />
            </div>
            <div>
              <div className="text-sm text-content">Gravar também no arquivo de música</div>
              <div className="text-[11px] text-muted">
                As alterações vão junto com o arquivo se você copiá-lo para outro aparelho. Desmarque para
                mudar só aqui dentro do Sonara.
              </div>
            </div>
          </div>

          {err && (
            <p className="text-danger text-sm break-words flex items-start gap-2">
              <IconAlert size={15} className="mt-0.5 shrink-0" /> {err}
            </p>
          )}
        </div>
      </Modal>

      {cropData && <CropModal dataUrl={cropData} busy={busy} onCancel={() => setCropData(null)} onCrop={onCropped} />}
    </>
  );
}
