"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Application, InboxJob } from "@/lib/career-ops";
import { sharedGet } from "@/lib/shared-fetch";

// A thin client mirror of the pipeline so BOTH the pages and the assistant
// console (a different subtree) can read inbox/applications. Hydrated once from
// /api/pipeline; refetches on window focus and on demand (refetch()) so the
// snapshot doesn't go stale after a status writeback or a new scan.
type Snapshot = {
  inbox: InboxJob[];
  applications: Application[];
  loading: boolean;
  refetch: () => void;
};

const PipelineContext = createContext<Snapshot | null>(null);

export function usePipeline(): Snapshot {
  const c = useContext(PipelineContext);
  if (!c) throw new Error("usePipeline must be used within <PipelineProvider>");
  return c;
}

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [inbox, setInbox] = useState<InboxJob[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchedAt = useRef(0);
  const refetch = useCallback(() => {
    fetchedAt.current = Date.now();
    setLoading(true);
    sharedGet("/api/pipeline")
      .then((r) => r.json())
      .then((d) => {
        setInbox(Array.isArray(d.inbox) ? d.inbox : []);
        setApplications(Array.isArray(d.applications) ? d.applications : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    // Focusing the window is frequent and the request is a full read of the pipeline: at most once a minute.
    const onFocus = () => {
      if (Date.now() - fetchedAt.current > 60_000) refetch();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  return (
    <PipelineContext.Provider value={{ inbox, applications, loading, refetch }}>
      {children}
    </PipelineContext.Provider>
  );
}
