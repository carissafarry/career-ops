"use client";

import { useState } from "react";
import { readItems, writeItems } from "@/lib/filter-sync.mjs";

const button = "rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50 max-sm:min-h-[44px]";

// Saved views and inbox filters are stored per browser. These two buttons carry
// them to another device: send from one, get on the other.
export function FilterSync() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);

  async function run(job: () => Promise<string>) {
    setBusy(true);
    setFailed(false);
    try {
      setNote(await job());
    } catch (err) {
      setFailed(true);
      setNote(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const send = () => run(async () => {
    const res = await fetch("/api/filter-sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: readItems(window.localStorage) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not send the filters.");
    return "Sent. Open Pipeline on your other device and press Get filters.";
  });

  const get = () => run(async () => {
    const res = await fetch("/api/filter-sync", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.savedAt) throw new Error("Nothing sent yet. Press Send filters on the other device first.");
    writeItems(window.localStorage, data.items);
    window.location.reload();
    return "";
  });

  return (
    <>
      <button type="button" disabled={busy} onClick={send} title="Copy your saved views and inbox filters so another device can get them" className={button}>
        Send filters
      </button>
      <button type="button" disabled={busy} onClick={get} title="Replace the saved views and inbox filters on this device with the ones last sent" className={button}>
        Get filters
      </button>
      {note && <span role={failed ? "alert" : "status"} className={failed ? "text-xs text-red-500" : "text-xs text-muted"}>{note}</span>}
    </>
  );
}
