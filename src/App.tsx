import { useEffect, useState } from "react";
import type { Screen } from "./types";
import Sidebar from "./components/Sidebar";
import PlayerBar from "./components/PlayerBar";
import QueuePanel from "./components/QueuePanel";
import NowPlaying from "./components/NowPlaying";
import Toasts from "./components/Toasts";
import LibraryScreen from "./screens/LibraryScreen";
import PlaylistsScreen from "./screens/PlaylistsScreen";
import SearchDownloadScreen from "./screens/SearchDownloadScreen";
import DownloadsScreen from "./screens/DownloadsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { usePlayerStore } from "./store/usePlayerStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { useDownloadsStore } from "./store/useDownloadsStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import UpdateBanner from "./components/UpdateBanner";

export default function App() {
  const [screen, setScreen] = useState<Screen>("library");
  const layout = usePlayerStore((s) => s.layout);
  const showQueue = usePlayerStore((s) => s.showQueue);
  const expanded = usePlayerStore((s) => s.expanded);
  const loadSettings = useSettingsStore((s) => s.load);
  const initDownloads = useDownloadsStore((s) => s.init);
  useKeyboardShortcuts(setScreen);

  useEffect(() => {
    loadSettings();
    // Subscribed once, at the top: a download started on the Search screen keeps
    // reporting (and toasting) even after the user navigates away.
    initDownloads();
  }, [loadSettings, initDownloads]);

  return (
    <div className="flex flex-col h-full">
      <UpdateBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar active={screen} onNavigate={setScreen} />
        <main className="relative flex-1 min-w-0 overflow-y-auto bg-ink aurora">
          {/* `key` re-mounts on navigation so each screen animates in. */}
          <div key={screen} className="relative z-10 px-8 py-7 animate-fade-up">
            {screen === "library" && <LibraryScreen />}
            {screen === "playlists" && <PlaylistsScreen />}
            {screen === "search" && <SearchDownloadScreen onGoToDownloads={() => setScreen("downloads")} />}
            {screen === "downloads" && <DownloadsScreen onGoToSearch={() => setScreen("search")} />}
            {screen === "settings" && <SettingsScreen />}
          </div>
        </main>
        {showQueue && <QueuePanel showArt={layout === "album"} />}
      </div>
      <PlayerBar />
      {expanded && <NowPlaying />}
      <Toasts />
    </div>
  );
}
