"use client";

import { useEffect } from "react";
import { processOfflineSyncQueue } from "@/lib/offline/sync-engine";

const syncIntervalMs = 30_000;

export function OfflineSyncProvider() {
  useEffect(() => {
    let cancelled = false;

    async function syncNow() {
      if (cancelled) return;
      await processOfflineSyncQueue().catch(() => undefined);
    }

    void syncNow();
    const interval = window.setInterval(syncNow, syncIntervalMs);
    window.addEventListener("online", syncNow);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", syncNow);
    };
  }, []);

  return null;
}
