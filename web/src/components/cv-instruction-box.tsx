"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, FileDown, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { MAX_CV_INSTRUCTIONS } from "@/lib/cv-instructions.mjs";
import { resolveCliId } from "@/lib/saved-cli";
import { btnBusy, btnPrimary } from "@/lib/action-styles";

type Msg = { role: "user" | "assistant"; content: string; at: string };

// "Your notes": a thread about what this CV should say. Each message is saved and
// answered with short feedback. Nothing is generated until Generate is pressed;
// the CV run then reads the candidate's own messages from the server.
export function CvInstructionBox({ n, company }: { n: string; company: string }) {
  const { jobs, startJob } = useJobs();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/cv-notes/${encodeURIComponent(n)}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d.messages)) setMessages(d.messages);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [n]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, sending]);

  const running = useMemo(
    () => jobs.find((j) => j.kind === "pdf" && j.input === n && j.status === "running"),
    [jobs, n],
  );
  const noteCount = messages.filter((m) => m.role === "user").length;
  const tooLong = text.length > MAX_CV_INSTRUCTIONS;

  const grow = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const send = async () => {
    const message = text.trim();
    if (!message || sending || tooLong) return;
    setSending(true);
    setError(null);
    // Shown at once; the server's copy replaces it when the reply arrives.
    setMessages((m) => [...m, { role: "user", content: message, at: new Date().toISOString() }]);
    setText("");
    requestAnimationFrame(grow);
    try {
      const cliId = await resolveCliId();
      const res = await fetch(`/api/cv-notes/${encodeURIComponent(n)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, cliId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the note.");
      if (Array.isArray(data.messages)) setMessages(data.messages);
      if (data.feedbackError) setError(`Saved, but no feedback: ${data.feedbackError}`);
    } catch (e) {
      setMessages((m) => m.filter((x) => !(x.role === "user" && x.content === message)));
      setText(message);
      setError(e instanceof Error ? e.message : "Could not save the note.");
    } finally {
      setSending(false);
    }
  };

  const generate = () =>
    startJob({ title: `CV PDF · ${company}`, subtitle: noteCount ? `from ${noteCount} note${noteCount === 1 ? "" : "s"}` : "tailored for this role", kind: "pdf", input: n, page: `/pipeline/${n}` });

  const clear = async () => {
    setMessages([]);
    setError(null);
    await fetch(`/api/cv-notes/${encodeURIComponent(n)}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <>
      {/* Nothing to show until the first note is sent. */}
      {(messages.length > 0 || sending) && (
      <section aria-label="Your notes" className="mt-5 rounded-2xl border border-border bg-surface/60 p-4 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <MessageSquareText className="size-4 text-brand-text" />
          <h2 className="font-display text-lg leading-tight text-foreground">Your notes</h2>
          <span className="text-xs text-faint">for the CV for {company}</span>
          {messages.length > 0 && (
            <button type="button" onClick={clear} className="ml-auto text-xs text-faint underline-offset-2 hover:text-foreground hover:underline">
              Clear notes
            </button>
          )}
        </div>

        {messages.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {messages.map((m, i) => (
              <li key={`${i}-${m.at}`} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {m.role === "user" ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-soft px-3.5 py-2 text-sm text-brand-text">{m.content}</p>
                ) : (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2 text-sm text-foreground">
                    <p className="mb-0.5 flex items-center gap-1 text-xs font-medium text-faint">
                      <Sparkles className="size-3" /> Feedback
                    </p>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  </div>
                )}
              </li>
            ))}
            {sending && (
              <li className="flex justify-start">
                <p className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2 text-sm text-muted">
                  <Loader2 className="size-3.5 animate-spin" /> Reading your note…
                </p>
              </li>
            )}
          </ul>
        )}
        <div ref={end} />

        {error && (
          <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {running ? (
            <Link href={`/jobs/${running.id}`} className={btnBusy}>
              <Loader2 className="size-4 animate-spin" /> Generating CV… open the run
            </Link>
          ) : noteCount > 0 ? (
            <button type="button" onClick={generate} disabled={sending} className={btnPrimary}>
              <FileDown className="size-4" /> Generate CV with these notes
            </button>
          ) : null}
          <span className="text-xs text-faint">Uses your AI. {noteCount} note{noteCount === 1 ? "" : "s"} will be used.</span>
        </div>
      </section>
      )}

      {/* fixed, not sticky: <main> clips overflow-x, which makes it the sticky container and stops sticking. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-3 sm:px-6 md:left-64 md:right-28 print:hidden">
        <div className="pointer-events-auto mx-auto max-w-[1800px]">
          <div className="flex items-end gap-2 rounded-3xl border border-border bg-surface px-4 py-2.5 shadow-lg transition focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/20">
            <textarea
              ref={area}
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value);
                grow();
              }}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter adds a line. Skip while an IME is composing.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Add a note for this CV…"
              aria-label="Add a note for this CV"
              className="max-h-[200px] min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-faint"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!text.trim() || sending || tooLong}
              aria-label="Send note"
              title="Send note (no CV is generated yet)"
              className="mb-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-40 max-sm:size-11"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
          <p className="mt-1.5 w-fit rounded-full bg-[var(--bg)]/80 px-2 text-xs text-faint backdrop-blur">
            {tooLong ? (
              <span className="text-red-700 dark:text-red-400">Keep a note to {MAX_CV_INSTRUCTIONS} characters or fewer.</span>
            ) : (
              "Enter sends the note and gets feedback. Notes only shape the CV when you press Generate. Shift+Enter adds a line."
            )}
          </p>
        </div>
      </div>
    </>
  );
}
