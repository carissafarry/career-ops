"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { previousMatchIndex } from "@/lib/history-back.mjs";

export function BackLink({ href, className, children, previous = false }: { href: string; className?: string; children: ReactNode; previous?: boolean }) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!("navigation" in window)) return;
    const current = window.navigation.currentEntry;
    if (!current) return;
    if (previous) {
      // Back means the page the candidate just came from, whatever it was; `href` is only the fallback.
      const prev = window.navigation.entries()[current.index - 1]?.url;
      if (prev && new URL(prev).origin === location.origin && prev !== location.href) {
        event.preventDefault();
        window.history.back();
      }
      return;
    }
    const match = previousMatchIndex(href, location.href, current.index, window.navigation.entries());
    if (match < 0) return;
    event.preventDefault();
    // history.go(-1) is history.back(). A checklist steps back through the report.
    window.history.go(match - current.index);
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
