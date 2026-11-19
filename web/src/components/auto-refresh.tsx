"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server parts of the current page on a timer, so a page that lists data written in the
 * background (a scan finishing, the LinkedIn watcher polling) stays current without a manual refresh.
 * It only runs while the tab is visible, and refreshes at once when the tab comes back, so a tab left in the
 * background is never stale for a full interval. Client state (selected scan, filters, scroll) is kept.
 */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router, seconds]);
  return null;
}
