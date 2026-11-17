import Link from "next/link";
import { cn } from "@/lib/cn";

// Stat tile: white card, soft shadow, icon in a pale violet square, bold
// tabular number. `featured` (≤1 per route) colors the number violet.
// `corner` is kept for callers; the old gradient corner is gone.
const CORNERS = {
  br: "bg-gradient-to-br",
  bl: "bg-gradient-to-bl",
  tr: "bg-gradient-to-tr",
} as const;

export function StatCard({
  href,
  icon: Icon,
  value,
  label,
  hint,
  featured = false,
  corner = "br",
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number | string;
  label: string;
  hint: string;
  featured?: boolean;
  corner?: keyof typeof CORNERS;
}) {
  return (
    <Link
      href={href}
      data-corner={corner}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-card transition-colors",
        "hover:border-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
      )}
    >
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft">
        <Icon className="size-5 text-brand-text" />
      </span>
      <div
        className={cn(
          "mt-4 text-4xl leading-none tracking-[-0.02em] tabular-nums",
          featured ? "font-extrabold text-brand-text" : "font-bold",
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-sm font-medium text-foreground">{label}</div>
      <div className="text-xs text-faint">{hint}</div>
    </Link>
  );
}
