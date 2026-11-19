import test from "node:test";
import assert from "node:assert/strict";
import { buildTrackerAddition, companySlug } from "../../src/lib/linkedin-watch/tracker-tsv.mjs";

const posting = { title: "Software Engineer", company: "PT. Example Maju, Tbk.", location: "Springfield (On-site)", link: "https://www.linkedin.com/jobs/view/1234567890/" };

test("builds the header and one row in the merge-tracker format, Applied with no score or report", () => {
  const { fileName, content } = buildTrackerAddition({ num: "042", date: "2026-11-19", posting });
  assert.equal(fileName, "042-pt-example-maju-tbk.tsv");
  const [header, row, rest] = content.split("\n");
  assert.equal(header, "num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl");
  assert.equal(rest, "");
  assert.deepEqual(row.split("\t"), ["042", "2026-11-19", "PT. Example Maju, Tbk.", "Software Engineer", "Applied", "N/A", "❌", "—", "", "https://www.linkedin.com/jobs/view/1234567890/"]);
});

test("tabs, newlines and pipes in posting text cannot shift columns or break the markdown row", () => {
  const { content } = buildTrackerAddition({ num: "7", date: "2026-11-19", posting: { ...posting, title: "Dev\t| Ops\nLead", company: "A|B" } });
  const cells = content.split("\n")[1].split("\t");
  assert.equal(cells.length, 10);
  assert.equal(cells[3], "Dev Ops Lead");
  assert.equal(cells[2], "A B");
});

test("a posting with no company uses the unknown-employer marker, and the slug has a fallback", () => {
  const { fileName, content } = buildTrackerAddition({ num: "9", date: "2026-11-19", posting: { ...posting, company: "" } });
  assert.equal(content.split("\n")[1].split("\t")[2], "?");
  assert.equal(fileName, "9-linkedin.tsv");
  assert.equal(companySlug("Müller & Söhne GmbH"), "muller-sohne-gmbh");
});

const noteCell = (r) => r.content.trim().split("\n")[1].split("\t")[8];
const goPosting = { title: "Go Developer", company: "Acme", location: "Remote", link: "https://boards.greenhouse.io/acme/jobs/1" };

test("the Notes cell holds only the note the user wrote, not the source or the place", () => {
  assert.equal(noteCell(buildTrackerAddition({ num: "1", date: "2026-11-20", posting: goPosting, note: "input 1yoe of golang" })), "input 1yoe of golang");
});

test("without a note the Notes cell is empty", () => {
  assert.equal(noteCell(buildTrackerAddition({ num: "1", date: "2026-11-20", posting: goPosting })), "");
});

test("a note is kept to one line and a pipe cannot break the row", () => {
  assert.equal(noteCell(buildTrackerAddition({ num: "1", date: "2026-11-20", posting: goPosting, note: "x | y\nz" })), "x y z");
});

test("the row still has every column when the note is empty, so the URL stays in its column", () => {
  const cells = buildTrackerAddition({ num: "1", date: "2026-11-20", posting: goPosting }).content.trim().split("\n")[1].split("\t");
  assert.equal(cells.length, 10);
  assert.equal(cells[9], goPosting.link);
});
