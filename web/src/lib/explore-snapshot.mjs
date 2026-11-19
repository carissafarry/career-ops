import { inPipelineUrls } from "./inbox-pending.mjs";

export function exploreSnapshot(inbox, applications) {
  return {
    inboxUrls: inPipelineUrls(inbox, applications),
    evaluated: applications.map((app) => ({ n: app.n, company: app.company, role: app.role, url: app.url || "" })),
  };
}
