import { pageFrameWidthClass } from "@/components/page-frame";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors linkedin-watch-view.tsx: the wide frame, a title, the status card, then the postings list.
export default function LinkedInLoading() {
  return (
    <div className={`mx-auto px-5 py-8 md:px-8 ${pageFrameWidthClass.wide}`} aria-label="Loading LinkedIn watcher">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-3 h-4 w-full max-w-lg" />
      <Skeleton className="mt-6 h-32 w-full" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  );
}
