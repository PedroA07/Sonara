import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateState {
  version: string;
  notes?: string;
}

// Checks for a new release on startup (Tauri updater). No-op in browser/dev.
export function useAutoUpdate() {
  const [available, setAvailable] = useState<UpdateState | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await check();
        if (u && !cancelled) {
          setUpdate(u);
          setAvailable({ version: u.version, notes: u.body });
        }
      } catch {
        /* running in the browser or updater disabled */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const install = async () => {
    if (!update) return;
    setInstalling(true);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch {
      setInstalling(false);
    }
  };

  return {
    available: dismissed ? null : available,
    installing,
    install,
    dismiss: () => setDismissed(true),
  };
}
