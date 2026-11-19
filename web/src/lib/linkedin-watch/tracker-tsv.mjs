// A tracker-addition TSV for a posting the user applied to, in the format merge-tracker.mjs reads
// ("Adding a role by hand" in modes/tracker.md): header row, one data row, N/A score, no report, no PDF.
// Cells are flattened: a tab or newline would shift the columns and a pipe would break the markdown row.
const clean = (s) => String(s ?? "").replace(/[\t\r\n|]+/g, " ").replace(/\s+/g, " ").trim();

export const companySlug = (company) =>
  clean(company).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "linkedin";

export function buildTrackerAddition({ num, date, posting, status = "Applied" }) {
  const location = clean(posting.location);
  const row = [
    num,
    date,
    clean(posting.company) || "?", // "?" is the tracker's marker for an unknown employer
    clean(posting.title),
    status,
    "N/A",
    "❌",
    "—",
    `LinkedIn watch${location ? `; ${location}` : ""}`,
    clean(posting.link),
  ];
  return {
    fileName: `${num}-${companySlug(posting.company)}.tsv`,
    content: "num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl\n" + row.join("\t") + "\n",
  };
}
