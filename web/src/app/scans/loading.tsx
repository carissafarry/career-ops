import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";

export default function ScansLoading() {
  return (
    <PageFrame width="wide" className="space-y-8">
      <div aria-label="Loading scans">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-3 h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </PageFrame>
  );
}
