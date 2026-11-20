import { ATS_LABEL, ATS_SOURCES } from "@/lib/explore";
import type { PlatformSource } from "@/lib/inbox";

// LinkedIn is read by the LinkedIn watcher, not scanned from Explore, so it is not part of AtsSource.
export const PLATFORM_ORDER: PlatformSource[] = [...ATS_SOURCES, "linkedin"];
export const PLATFORM_LABEL: Record<PlatformSource, string> = { ...ATS_LABEL, linkedin: "LinkedIn" };
