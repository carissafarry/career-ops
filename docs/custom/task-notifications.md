# Task: new-posting notifications

Part of the fast-discovery work (`fast-discovery-tasks.md`, task 2). Separate task, so it can ship on its own.

**Goal:** the user hears about a new matching posting within minutes of a scan finding it, without opening the dashboard.

## Which channel first

| Channel | Setup | Cost | Verdict |
|---|---|---|---|
| macOS notification | none (built in: `osascript`) | free | **Start here** |
| Telegram bot | create a bot, keep a token and chat id | free | Second, works on the phone |
| Email | SMTP or an app password | free | Later, slow to arrive |

## Step 1: macOS notification (the quick win)

**Do:**
- Write `scripts/notify-new-roles.mjs` (zero dependencies). It runs after a scan and reads `data/scan-runs.tsv` (the last row's `new_added`) and the newest `added` rows of `data/scan-history.tsv`.
- When `new_added` is above 0, show one notification: "3 new roles" with the first two titles and companies as the body. Use `osascript -e 'display notification "..." with title "career-ops" sound name "Glass"'`. Pass the text as an argument, never by building a shell string from posting text (titles come from untrusted job pages).
- Cap the text at about 200 characters; strip control characters and quotes.
- Do nothing when there are no new roles, so there is no noise.
- Hook it in as the last step of the scheduled scan (task 1). Until task 1 exists, run it by hand after `node scan.mjs`.

**Open question for step 1:** clicking a macOS notification cannot open the dashboard URL with plain `osascript`. If the user wants a click-through, add `terminal-notifier` (`brew install terminal-notifier`, ask first) and open `http://127.0.0.1:3000/pipeline`.

**Done when:**
- A scan that adds roles shows exactly one notification, and a scan that adds none shows nothing.
- A posting title containing quotes or backticks does not break or inject into the command.

**Effort:** small.

## Step 2: Telegram (optional, phone)

- The user creates a bot with BotFather and gives the token and chat id; store them in `.env` (gitignored), never in a tracked file.
- Send the same summary with the Bot API `sendMessage`. Send only titles, companies and links; no CV or profile data.
- Same rule as step 1: one message per scan, only when something is new.

## Not in scope

- Applying to anything automatically. Notifications only tell the user a posting exists.
- LinkedIn scraping.
