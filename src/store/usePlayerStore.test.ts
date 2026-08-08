import { beforeEach, describe, expect, it } from "vitest";
import { hasVideo, paneAfterTrackChange, usePlayerStore } from "./usePlayerStore";
import type { Track } from "../types";

function track(id: number, video?: string): Track {
  return {
    id,
    title: `Faixa ${id}`,
    file_path: `/musica/${id}.m4a`,
    duration: 200,
    track_no: null, disc_no: null, year: null, genre: null, album_id: null,
    bitrate: null, format: null, gain: null, cover_path: null,
    artist_name: null, album_title: null,
    video_path: video ?? null,
    video_offset_ms: 0,
  };
}

const reset = () =>
  usePlayerStore.setState({
    queue: [], currentIndex: 0, isPlaying: false, positionMs: 0,
    pane: "cover", mediaMode: "audio", repeat: "off", shuffle: false,
  });

describe("paneAfterTrackChange", () => {
  it("não mexe nas abas Capa e Letra", () => {
    expect(paneAfterTrackChange("cover", track(1), "audio")).toBe("cover");
    expect(paneAfterTrackChange("lyrics", track(1), "audio")).toBe("lyrics");
  });

  it("cai para a Letra quando estava assistindo e a nova faixa não tem vídeo", () => {
    expect(paneAfterTrackChange("video", track(2), "video")).toBe("lyrics");
  });

  it("fica na aba Vídeo quando a nova faixa também tem vídeo", () => {
    expect(paneAfterTrackChange("video", track(2, "/v/2.mp4"), "video")).toBe("video");
  });

  it("não expulsa quem está na aba só olhando a oferta de baixar", () => {
    // Aba Vídeo aberta com o áudio tocando: a pessoa não estava assistindo,
    // então trocar de faixa não deve tirá-la de onde ela escolheu ficar.
    expect(paneAfterTrackChange("video", track(2), "audio")).toBe("video");
  });

  it("uma faixa sem arquivo de vídeo nunca conta como tendo vídeo", () => {
    expect(hasVideo(track(1))).toBe(false);
    expect(hasVideo({ ...track(1), video_path: "   " })).toBe(false);
    expect(hasVideo(track(1, "/v/1.mp4"))).toBe(true);
    expect(hasVideo(undefined)).toBe(false);
  });
});

describe("usePlayerStore — modo vídeo", () => {
  beforeEach(reset);

  it("trocar de faixa com o modo Vídeo ativo e sem vídeo na próxima cai para Letra", () => {
    usePlayerStore.setState({
      queue: [track(1, "/v/1.mp4"), track(2)],
      currentIndex: 0,
      pane: "video",
      mediaMode: "video",
    });

    usePlayerStore.getState().next();

    const s = usePlayerStore.getState();
    expect(s.currentIndex).toBe(1);
    expect(s.pane).toBe("lyrics");
    // E o backend volta a ser o de áudio, senão a PlayerBar tentaria abrir um
    // vídeo que não existe.
    expect(s.mediaMode).toBe("audio");
  });

  it("a regra vale para todos os caminhos de troca de faixa", () => {
    const withVideo = [track(1, "/v/1.mp4"), track(2)];

    for (const move of [
      () => usePlayerStore.getState().next(),
      () => usePlayerStore.getState().jumpTo(1),
      () => usePlayerStore.getState().handleEnded(),
    ]) {
      usePlayerStore.setState({
        queue: withVideo, currentIndex: 0, pane: "video", mediaMode: "video",
      });
      move();
      expect(usePlayerStore.getState().pane).toBe("lyrics");
      expect(usePlayerStore.getState().mediaMode).toBe("audio");
    }
  });

  it("continua no vídeo quando a próxima faixa também tem um", () => {
    usePlayerStore.setState({
      queue: [track(1, "/v/1.mp4"), track(2, "/v/2.mp4")],
      currentIndex: 0,
      pane: "video",
      mediaMode: "video",
    });

    usePlayerStore.getState().next();

    expect(usePlayerStore.getState().pane).toBe("video");
    expect(usePlayerStore.getState().mediaMode).toBe("video");
  });

  it("abrir a aba Vídeo sem vídeo baixado não troca o backend", () => {
    usePlayerStore.setState({ queue: [track(1)], currentIndex: 0 });
    usePlayerStore.getState().setPane("video");

    const s = usePlayerStore.getState();
    // A aba abre — é onde fica a oferta de baixar — mas o áudio segue tocando.
    expect(s.pane).toBe("video");
    expect(s.mediaMode).toBe("audio");
  });

  it("abrir a aba Vídeo com vídeo baixado pede o backend de vídeo", () => {
    usePlayerStore.setState({ queue: [track(1, "/v/1.mp4")], currentIndex: 0 });
    usePlayerStore.getState().setPane("video");
    expect(usePlayerStore.getState().mediaMode).toBe("video");
  });

  it("sair da aba Vídeo devolve o áudio", () => {
    usePlayerStore.setState({
      queue: [track(1, "/v/1.mp4")], currentIndex: 0, pane: "video", mediaMode: "video",
    });
    usePlayerStore.getState().setPane("lyrics");
    expect(usePlayerStore.getState().mediaMode).toBe("audio");
  });

  it("repetir a mesma faixa não reinicia a aba nem o backend", () => {
    usePlayerStore.setState({
      queue: [track(1, "/v/1.mp4")], currentIndex: 0,
      pane: "video", mediaMode: "video", repeat: "one",
    });
    usePlayerStore.getState().handleEnded();

    const s = usePlayerStore.getState();
    expect(s.seekReqMs).toBe(0);
    expect(s.pane).toBe("video");
    expect(s.mediaMode).toBe("video");
  });
});
