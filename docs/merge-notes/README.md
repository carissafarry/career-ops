# Merge notes

A record of every time this fork (`custom`) takes in upstream (`origin/main`).
It exists so nobody has to remember, months later, what conflicted, what changed
in how the app behaves, and which upstream behaviours were left out on purpose.

This directory belongs to the fork. Upstream has no `docs/merge-notes/`, so a
merge never conflicts here. If `update-system.mjs apply` is ever run, check that
this directory survived; it is tracked in git, so `git checkout HEAD -- docs/merge-notes/`
restores it.

## When to write one

On every merge from `origin/main`, in the same sitting as the merge. One file per
merge, named `YYYY-MM-DD-origin-main-<short sha>.md`. Add a row to the index below.

## What each note contains

1. **Range.** The upstream commits taken (merge base, upstream tip, count), our tip
   before the merge, and the merge commit.
2. **Conflicts.** Each conflicted file: what upstream changed, what we changed, how it
   was resolved and why.
3. **Their behaviour we now have.** Upstream changes that reach the app, and what the
   user will notice.
4. **Our behaviour that must stay.** The places where we changed something upstream also
   touches, so the next merge knows what not to lose.
5. **Not taken.** Upstream behaviour that arrived as code but has no counterpart in our
   web UI, or that we chose not to use, with the reason and when to revisit it.
6. **Agreed.** What was decided with the user, and when.
7. **Checked, and not checked.** The tests and manual checks that ran, and what was
   left unverified.
8. **Open questions.** Anything to look at on the next merge.

Write what was verified as verified and what was assumed as assumed. A note that
hedges nothing and proves nothing is worse than a short one.

## Index

| Date | Upstream tip | Note |
|---|---|---|
| 2026-11-19 | `f9519c1c` (29 commits) | [2026-11-19-origin-main-f9519c1c.md](2026-11-19-origin-main-f9519c1c.md) |
