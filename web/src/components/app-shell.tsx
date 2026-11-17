"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CoMark } from "@/components/co-mark";
import { AssistantConsole } from "@/components/assistant-console";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackToTop } from "@/components/back-to-top";
import { CommandPalette } from "@/components/command-palette";
import { JobsProvider } from "@/components/jobs/job-store";
import { PipelineProvider } from "@/components/pipeline/pipeline-provider";
import { ApplyProvider } from "@/components/apply/apply-provider";
import { ExploreProvider } from "@/components/explore/explore-provider";
import { FirstScoreView } from "@/components/explore/first-score-view";
import { BetaBanner } from "@/components/beta/beta-banner";
import { WorkerPills } from "@/components/jobs/worker-pills";
import { visibleNavItems, isActivePath } from "@/lib/nav-items";

export function AppShell({ children, followupsEnabled }: { children: React.ReactNode; followupsEnabled: boolean }) {
  const pathname = usePathname();
  return (
    <JobsProvider>
      <PipelineProvider>
      <ApplyProvider>
      <ExploreProvider>
      <a
        href="#main-content"
        className="sr-only rounded-md bg-brand text-sm font-medium text-brand-foreground focus:not-sr-only focus:fixed focus:px-3 focus:py-2 focus:left-3 focus:top-3 focus:z-[100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        Skip to content
      </a>
      <MobileNav followupsEnabled={followupsEnabled} />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 z-10 hidden print:hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-4 py-6 [scrollbar-width:thin] md:flex">
          <Link href="/" className="mb-6 flex items-center gap-3 px-2">
            <CoMark size={38} />
            <span className="text-[1.375rem] font-extrabold leading-none tracking-[-0.03em] text-landing">
              career-ops<span className="text-brand-text">.</span>
            </span>
          </Link>
          <CommandPalette followupsEnabled={followupsEnabled} />
          <nav className="flex flex-col gap-1">
            {visibleNavItems(followupsEnabled).map(({ href, label, icon: Icon, chip }) => {
              const active = isActivePath(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-2 text-[0.9375rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                    active
                      ? "bg-brand-soft font-semibold text-brand-text"
                      : "text-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <Icon className="size-[18px]" />
                  {label}
                  {chip && (
                    <span className="ml-auto rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-semibold capitalize tracking-[0.01em] text-brand-text">
                      {chip}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <WorkerPills />

          <div className="mt-auto space-y-3 pb-16 pt-4 md-tall:pb-40">
            <ThemeToggle showLabel />
          </div>
        </aside>
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden focus:outline-none">{children}</main>
        <div className="print:hidden">
          <AssistantConsole />
          <BackToTop />
          <FirstScoreView />
          <BetaBanner />
        </div>
      </div>
      </ExploreProvider>
      </ApplyProvider>
      </PipelineProvider>
    </JobsProvider>
  );
}
