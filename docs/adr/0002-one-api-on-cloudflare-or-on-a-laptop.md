# One API, hosted on Cloudflare or run on a laptop

todos runs as one API that every client talks to: the web app, the TUI, the MCP server and the Claude Code hooks. The same API runs in two places. In the cloud it is a Cloudflare Worker using D1, behind Cloudflare Access, which allows only my Google account on every app under my domain. On a laptop it runs locally against a SQLite file, which is how I use todos on another computer and how todos is developed and tested before it is deployed. The clients only know an API address, and in the cloud an Access service token, so they never know which database is behind it.

Each place is a separate copy with its own data. A local copy on another computer never sends anything to the cloud, and the cloud copy never appears on that computer.

## Considered options

- Supabase. Rejected because sign-in would have to be built into every app, and Postgres would mean either running Postgres on every laptop or writing every query twice, once for Postgres and once for SQLite. D1 is SQLite, so one schema works in both places.
- Keeping the data only on my laptop and reaching it from my phone over a private network. Rejected because capture on my phone would fail whenever the laptop is asleep.
- Local-first sync between devices. Rejected because merging edits from several devices is a large project in its own right.

## Consequences

- There are no built-in live updates, so Home and the web app poll for changes, which is enough for one user.
- Only capture works without a signal. The phone app keeps captures and sends them once it is back online, and everything else needs a connection.
