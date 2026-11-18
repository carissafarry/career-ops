"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

// The words a posting's description must mention (Must mention) or must not mention
// (Never mention): content_filter in portals.yml. Changes are written to the file
// as text, so its comments stay, and apply to the next scan and Explore search.

type Summary = {
  positive: string[];
  negative: string[];
  minMatch: number | null;
  rescueTitleMisses: boolean;
  scopedByTitle: boolean;
  fileExists: boolean;
};
type Key = "positive" | "negative";

const SECTIONS: { key: Key; title: string; help: string; placeholder: string }[] = [
  {
    key: "negative",
    title: "Never mention",
    help: "A posting is dropped when its description has any of these words.",
    placeholder: "e.g. CRM",
  },
  {
    key: "positive",
    title: "Must mention",
    help: "When this list has words, a posting is kept only if its description has at least one of them.",
    placeholder: "e.g. golang",
  },
];

/** How an entry matches (`word:`/`stem:` prefix) and the text a person reads. */
function parseEntry(entry: string): { mode: "word" | "stem" | ""; text: string } {
  const m = /^(word|stem):(.*)$/i.exec(entry.trim());
  return m ? { mode: m[1].toLowerCase() as "word" | "stem", text: m[2].trim() } : { mode: "", text: entry.trim() };
}

export function DescriptionFilterCard() {
  const [data, setData] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/portals/content-filter")
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        return body as Summary;
      })
      .then((body) => alive && setData(body))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : "Could not read portals.yml."));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section aria-labelledby="desc-filter-title" className="mt-8 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 id="desc-filter-title" className="text-base font-semibold text-foreground">
        Description filters
      </h2>
      <p className="mt-1 text-sm text-muted">
        Words in a job&apos;s description that decide whether it is shown to you. They apply to every scan and to Explore, and are
        saved in <code className="text-muted">portals.yml</code>. A posting with no description is never dropped by these.
      </p>
      {loadError && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </p>
      )}
      {!data && !loadError && <p className="mt-3 text-sm text-faint">Reading portals.yml…</p>}
      {data && (
        <div className="mt-4 grid gap-6">
          {data.scopedByTitle && (
            <p className="text-xs text-faint">portals.yml also has rules for specific job titles (by_title_keyword). Those are edited in the file.</p>
          )}
          {SECTIONS.map((s) => (
            <WordList key={s.key} section={s} data={data} onChange={setData} />
          ))}
        </div>
      )}
    </section>
  );
}

function WordList({ section, data, onChange }: { section: (typeof SECTIONS)[number]; data: Summary; onChange: (d: Summary) => void }) {
  const list = data[section.key];
  const [draft, setDraft] = useState("");
  const [whole, setWhole] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputId = `desc-${section.key}-input`;

  async function change(body: { add?: string[]; remove?: string[] }, done: string): Promise<boolean> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/portals/content-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: section.key, ...body }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw new Error(out?.error || `HTTP ${res.status}`);
      onChange(out as Summary);
      setNotice(done);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The change was not saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const typed = draft.trim();
    if (!typed || busy) return;
    const entry = parseEntry(typed).mode ? typed : whole ? `word:${typed}` : typed;
    if (list.some((e) => e.trim().toLowerCase() === entry.toLowerCase())) {
      setError(`"${typed}" is already in this list.`);
      setNotice("");
      return;
    }
    if (await change({ add: [entry] }, `Added "${typed}". It applies from the next scan.`)) setDraft("");
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-sm font-medium text-foreground">
          {section.title} <span className="font-normal text-faint">· {list.length}</span>
        </h3>
        <p className="text-xs text-faint">{section.help}</p>
      </div>
      {section.key === "positive" && data.minMatch !== null && (
        <p className="mt-1 text-xs text-faint">portals.yml asks for at least {data.minMatch} of these words in a description (min_match).</p>
      )}
      {list.length > 0 ? (
        <ul className="mt-2 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-1" aria-label={section.title}>
          {list.map((entry) => {
            const { mode, text } = parseEntry(entry);
            return (
              <li
                key={entry}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover py-0.5 pl-2.5 pr-1 text-xs text-foreground"
              >
                <span>{text}</span>
                {mode && <span className="text-faint">{mode === "word" ? "whole word" : "word start"}</span>}
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${text} from ${section.title.toLowerCase()}`}
                  onClick={() => void change({ remove: [entry] }, `Removed "${text}".`)}
                  className="rounded-full p-1 text-muted transition-colors hover:text-foreground disabled:opacity-60 max-sm:min-h-[44px] max-sm:min-w-[44px]"
                >
                  <X className="mx-auto size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Empty.</p>
      )}
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Add to {section.title.toLowerCase()}
        </label>
        <input
          id={inputId}
          value={draft}
          maxLength={80}
          disabled={busy}
          placeholder={section.placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          className="w-56 rounded-full border border-border bg-surface/40 px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-faint focus:border-brand/40 max-sm:min-h-[44px]"
        />
        <label className="inline-flex items-center gap-1.5 text-xs text-muted max-sm:min-h-[44px]">
          <input type="checkbox" checked={whole} disabled={busy} onChange={(e) => setWhole(e.target.checked)} />
          Whole word only
        </label>
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className={cn(
            "rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text max-sm:min-h-[44px]",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {busy ? "Saving…" : "Add"}
        </button>
      </form>
      <p role="status" aria-live="polite" className="mt-1 min-h-4 text-xs text-muted">
        {notice}
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
