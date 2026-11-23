import { viewedOutcomes } from "@/lib/viewed-outcomes.mjs";

type AppRow = { n: string; status: string };
type LogRow = { num: number; from: string; to: string };

const STAGE_LABEL: Record<string, string> = {
  RESPONDED: "Responded",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
};

// Of the applications an employer opened, how many went on to a next step and
// how many did not. Server-rendered: it needs only the tracker and the status log
// the page already reads.
export function ViewedOutcomes({ applications, statusLog }: { applications: AppRow[]; statusLog: LogRow[] }) {
  const o = viewedOutcomes(applications, statusLog);
  const segments = [
    { key: "advanced", label: "Moved on", hint: "Responded or further", value: o.advanced, bar: "bg-emerald-500", dot: "bg-emerald-500" },
    { key: "waiting", label: "Still waiting", hint: "Viewed, no answer yet", value: o.waiting, bar: "bg-sky-500", dot: "bg-sky-500" },
    { key: "stopped", label: "No next step", hint: "Rejected or discarded", value: o.stopped, bar: "bg-red-400", dot: "bg-red-400" },
  ];
  const stages = Object.entries(o.byStage).filter(([, count]) => (count as number) > 0);

  return (
    <section className="mt-10 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5" aria-labelledby="viewed-outcomes-heading">
      <p className="text-sm font-semibold text-brand-text">Outcomes</p>
      <h2 id="viewed-outcomes-heading" className="mt-2 font-display text-xl tracking-tight text-landing">
        After Viewed
      </h2>
      <p className="mt-1 max-w-xl text-xs leading-5 text-muted">
        Applications an employer opened, by where they stand now. A role counts once it has been Viewed, even if it moved on or was closed afterwards.
      </p>

      {o.total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted">
          Nothing here yet. Mark an application Viewed and this chart fills in.
        </p>
      ) : (
        <>
          <div
            className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-surface-hover"
            role="img"
            aria-label={`${o.total} viewed applications: ${o.advanced} moved on, ${o.waiting} still waiting, ${o.stopped} with no next step`}
          >
            {segments.map((s) =>
              s.value > 0 ? <div key={s.key} className={`${s.bar} transition-[width] duration-500`} style={{ width: `${(s.value / o.total) * 100}%` }} /> : null,
            )}
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-3">
            {segments.map((s) => (
              <div key={s.key} className="rounded-xl border border-border bg-background px-3.5 py-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted">
                  <span className={`size-2 rounded-full ${s.dot}`} aria-hidden />
                  {s.label}
                </dt>
                <dd className="mt-0.5 text-xl tabular-nums text-foreground">{s.value}</dd>
                <dd className="text-xs text-faint">{s.hint}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-sm text-muted">
            {o.advancedOfResolved === null ? (
              <>None of the {o.total} viewed has an answer yet.</>
            ) : (
              <>
                <span className="tabular-nums text-foreground">{o.advancedOfResolved}%</span> of the {o.advanced + o.stopped} that got an answer moved on.
              </>
            )}
            {stages.length > 0 && (
              <span className="text-faint"> Moved on: {stages.map(([stage, count]) => `${STAGE_LABEL[stage]} ${count}`).join(", ")}.</span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
