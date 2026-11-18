// One look for the action buttons on the evaluation page. They are squarish
// (8px radius), 36px tall, with a visible border and a label in full text
// colour, so they read as buttons and not as the small rounded tags used for
// status. One primary per group is filled violet.
const base =
  "inline-flex items-center justify-center gap-2 rounded-[8px] border px-3.5 py-2 text-sm font-medium leading-tight shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 max-sm:min-h-[44px]";

/** Plain action. */
export const btn = `${base} border-foreground/20 bg-surface text-foreground hover:border-foreground/35 hover:bg-surface-hover`;
/** The main action of a group, filled. */
export const btnPrimary = `${base} border-transparent bg-brand text-brand-foreground hover:bg-brand-200`;
/** An action that is running or a result that is ready to open. */
export const btnBusy = `${base} border-brand/40 bg-brand-soft text-brand-text hover:bg-brand-soft/70`;
/** A finished result (a file exists). */
export const btnDone = `${base} border-emerald-500/50 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-400`;
