import { useEffect, useState } from "react";
import type { Screen } from "./types";
import Sidebar from "./components/Sidebar";
import PlayerBar from "./components/PlayerBar";
import QueuePanel from "./components/QueuePanel";
import NowPlaying from "./components/NowPlaying";
import LibraryScreen from "./screens/LibraryScreen";
import PlaylistsScreen from "./screens/PlaylistsScreen";
import SearchDownloadScreen from "./screens/SearchDownloadScreen";
import DownloadsScreen from "./screens/DownloadsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { usePlayerStore } from "./store/usePlayerStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import UpdateBanner from "./components/UpdateBanner";

export default function App() {
  const [screen, setScreen] = useState<Screen>("library");
  const layout = usePlayerStore((s) => s.layout);
  const showQueue = usePlayerStore((s) => s.showQueue);
  const expanded = usePlayerStore((s) => s.expanded);
  const loadSettings = useSettingsStore((s) => s.load);
  useKeyboardShortcuts();

  useEffect(() => { loadSettings(); }, [loadSettings]);

  return (
    <div className="flex flex-col h-full">
      <UpdateBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar active={screen} onNavigate={setScreen} />
        <main className="flex-1 min-w-0 overflow-y-auto bg-ink px-8 py-6">
          {screen === "library" && <LibraryScreen />}
          {screen === "playlists" && <PlaylistsScreen />}
          {screen === "search" && <SearchDownloadScreen />}
          {screen === "downloads" && <DownloadsScreen />}
          {screen === "settings" && <SettingsScreen />}
        </main>
        {showQueue && <QueuePanel showArt={layout === "album"} />}
      </div>
      <PlayerBar />
      {expanded && <NowPlaying />}
    </div>
  );
}
