// "Applied" from a Pipeline row: the job becomes an `Applied` tracker row without being shortlisted or scored first.
// `trackerAdd` is addAppliedToTracker (reserve a number, write the tracker-addition, merge it, close the inbox line).

/**
 * @param {{url: string, company: string, role: string, location?: string}[]} pending the inbox's pending jobs
 * @param {string[]} urls the jobs the user marked
 * @param {(posting: {title: string, company: string, location: string, link: string}, note: string) => Promise<{ok: boolean, error?: string}>} trackerAdd
 * @param {string} [note] written to every row marked (the tracker's Notes cell)
 * @returns {Promise<{applied: string[], failed: {url: string, company?: string, error: string}[]}>}
 */
export async function markInboxApplied(pending, urls, trackerAdd, note = "") {
  const applied = [];
  const failed = [];
  // One after another: each merge takes the tracker lock.
  for (const url of [...new Set(urls)]) {
    const job = pending.find((j) => j.url === url);
    if (!job) {
      failed.push({ url, error: "That job is not in your inbox any more." });
      continue;
    }
    try {
      const r = await trackerAdd({ title: job.role, company: job.company, location: job.location ?? "", link: job.url }, note);
      if (r.ok) applied.push(url);
      else failed.push({ url, company: job.company, error: r.error ?? "Could not add it to the tracker." });
    } catch (e) {
      failed.push({ url, company: job.company, error: e instanceof Error ? e.message : "Could not add it to the tracker." });
    }
  }
  return { applied, failed };
}
