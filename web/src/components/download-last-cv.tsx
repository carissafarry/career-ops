"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { btn } from "@/lib/action-styles";

// Offers the most recently generated CV on every evaluation page, even when it
// was made for another job. Hidden until one exists.
export function DownloadLastCv() {
  const [last, setLast] = useState<{ name: string; at: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/cv-pdf/last?info=1")
        .then((r) => r.json())
        .then((d) => alive && setLast(d?.name ? { name: d.name, at: d.at } : null))
        .catch(() => {});
    load();
    // A CV finished on this page changes what "last" is.
    window.addEventListener("co-job-done", load);
    return () => {
      alive = false;
      window.removeEventListener("co-job-done", load);
    };
  }, []);

  if (!last) return null;
  const when = new Date(last.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <a
      href="/api/cv-pdf/last?download=1"
      title={`${last.name} · generated ${when}`}
      className={btn}
    >
      <Download className="size-3.5" /> Download last generated CV
    </a>
  );
}
