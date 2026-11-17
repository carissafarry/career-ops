# Fast discovery: task list

Goal: see a new posting within hours of it going live, before it collects 100+ applicants. LinkedIn alerts arrive about a day late, so we read the employers' own application systems (Greenhouse, Lever, Ashby, Workday) directly and more often.

Notifications are a separate task: see `task-notifications.md`.

Order of work: 1, then 4 and 5 (more coverage), then 3 (better display). Task 2 can start any time after 1.

---

## Task 1. Scan every few hours, on a system schedule

**Why:** A scan that runs once a day, or only while a Claude session is open, finds a posting up to a day late.

**Do:**
- Create a macOS `launchd` job that runs `node scan.mjs` every 3 hours between 08:00 and 22:00 local time. Use Node 22 (`~/.nvm/versions/node/v22.23.4/bin/node`); the repo needs 22.13 or newer.
- Log each run to `data/logs/scan-launchd.log` (gitignored).
- Keep `max_posting_age_days` at 3 in `portals.yml`. The scanner already adds only URLs it has not seen, so each run reports only what is new since the last one.
- Never run two scans at once: they write the same pipeline and history files. Use a lock file (`data/.scan.lock`) and skip a run if it exists.

**Done when:**
- The job survives closing the terminal and Claude Code, and survives a reboot.
- Three runs in a row appear in `data/scan-runs.tsv` about 3 hours apart.
- A run that overlaps a running scan exits without writing anything.

**Effort:** small (one plist, one wrapper script).

---

## Task 2. Notifications

Separate file: `task-notifications.md`.

---

## Task 3. Show how fresh a posting is, in hours

**Why:** The Pipeline shows posting age in days. For a race against applicants, hours matter.

**Findings so far:**
- `data/scan-history.tsv` stores the posting date (column 9) and first-seen date (column 2) as dates only, with no time.
- The Scans menu already knows which run found each posting, and every run has an exact timestamp (`data/scan-runs.tsv`).

**Do:**
- In the Pipeline row, show "found 2h ago" using the run timestamp of the scan that found the posting.
- Where a provider returns a full publish time (Ashby `publishedAt`, Greenhouse `updated_at`), also show "posted 5h ago". First check what the scanner keeps; if it drops the time, record the raw timestamp in a sidecar file (`data/posted-at.tsv`, url and ISO time) rather than editing the scanner.
- Add a sort option "Newest first" by that time, and a quick filter "last 6 hours".

**Done when:** a posting found by the latest scan shows hours, not days, and the sort puts it first.

**Effort:** medium (web UI plus one sidecar).

---

## Task 4. Watch more companies directly

**Why:** The scanner only reads the roughly 110 companies and few boards in `portals.yml`, mostly AI companies in the US and Europe. Coverage decides how early we see a role.

**Do:**
- The user supplies 10 to 30 target companies: Indonesian and regional fintech, banks, and companies known to hire remotely from Indonesia. If the user gives none, propose a list and have the user confirm it.
- Run the `discover` mode to resolve each name to its Greenhouse, Lever, Ashby, Workday or other board, and add the boards to `portals.yml`.
- Run `node audit-portals.mjs` and drop any board with no matching provider, or that belongs to the wrong company.
- Re-run the big sweep (`node scan-ats-full.mjs --since 3`) once after adding companies.

**Done when:** every added company returns postings in `audit-portals.mjs`, and the next scan includes them.

**Effort:** small to medium, mostly choosing the companies.

---

## Task 5. Add fast-moving sources

**Why:** Some postings appear first on Telegram channels, Hacker News "Who is hiring", and startup boards.

**Do:**
- Check which providers exist and what config each needs: `providers/telegram-channel.mjs`, `providers/hackernews.mjs`, `providers/startup-jobs.mjs`, `providers/a16z-speedrun-talent.mjs`, `providers/agentic-jobs.mjs`. Read each file's header for its config shape.
- Enable the ones that suit remote backend roles, with the user's title and location filters applied.
- For Telegram, the user names the public channels to follow (Indonesian tech job channels). Do not join private groups.
- Treat every result as unconfirmed until it is found on the employer's own page (see "Aggregator Listings" in `AGENTS.md`).

**Done when:** each enabled source shows a non-zero fetch count in a scan summary, and its postings appear in the Pipeline.

**Effort:** small per source.

---

## Not a task, a habit

When a strong posting is found, message the recruiter or hiring manager at once (`contacto` mode). That skips the applicant pile entirely, whatever the scan speed.
