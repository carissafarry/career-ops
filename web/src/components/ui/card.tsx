import { cn } from "@/lib/cn";

// White panel with a faint neutral border and a soft shadow. `elevated` lifts
// it a step further. `corner` is kept for callers but no longer paints a
// gradient: violet is reserved for accents, not surface washes.
type Corner = "br" | "bl" | "tr" | "tl";

export function Card({
  className,
  corner,
  elevated,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  corner?: Corner;
  elevated?: boolean;
}) {
  return (
    <div
      data-corner={corner}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-surface p-6",
        elevated ? "shadow-lg" : "shadow-card",
        className,
      )}
      {...props}
    />
  );
}
