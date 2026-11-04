## Agent skills

### Issue tracker

Issues are GitHub Issues on this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels are used as they are: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

One context: a single `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Principles

- Keep the TUI and the web app calm and simple. Using them should take as little effort as possible.
- Calm does not mean plain. The TUI should look striking and futuristic, with motion that is smooth and hypnotic, such as a shimmer on threads whose session is working. Motion shows that things are alive. It never demands attention, so there are no flashing alerts, sounds or counts.
- Be consistent and never surprise me. The same thing works the same way wherever it appears, so a key or a panel does what I would expect from having used it somewhere else. Anything that differs by place is an extra I turn on, never the default.
- Keep the number of concepts small. Add a new one only when it is really needed, because every extra concept brings edge cases with it.
- I only move from one thread to another by going through Home. There is no shortcut from one session straight to another, and nothing that tempts me to jump, because switching should be a choice I make on purpose. This is about my attention. Sessions can still prompt each other. Inside a thread nothing shows the state of other threads, and Alt+h is the one way back to Home. See `docs/adr/0001-terminal-app-is-ink-inside-its-own-tmux-server.md`.
- todos must run in two ways that behave the same: hosted in the cloud, and entirely on one laptop against a local SQLite file. The local way is also how todos is developed and tested before anything is deployed. Installing and setting up either way should be easy, so every design choice has to work for both.
- Build in small slices, each of which can be tested and given feedback on its own.
- Everything todos does can be checked by a test that passes or fails the same way every run. When something on screen is not settled the moment an action returns, the app says when it is, so a test reads a final result instead of waiting on time.

## Workflow

Every piece of work on todos is an issue first, and the issues are its backlog and its permanent record. They are GitHub Issues on this repo, and the queue of what comes next is the repo's GitHub Projects board (see `docs/agents/issue-tracker.md`). A todos Session also keeps its Thread true: the Thread says where the work stands, and the issue records it. A Thread can work through several issues or be one issue.

The manager keeps the board up to date with `gh`, following the rules in the board's README. It adds each new issue with `gh project item-add 1 --owner @me --url <issue url>` and sets its Status and Lane with `gh project item-edit`, which takes the ids that `gh project item-list 1 --owner @me --format json` and `gh project field-list 1 --owner @me --format json` give. The Status on the board follows the issue's Status label, an issue moves to In progress when its build starts and to Done when it is closed, because the board does not move closed issues by itself. Moving a card within its column needs `gh api graphql` with the `updateProjectV2ItemPosition` mutation, which puts the card after a given card, or at the top when no card is given.

### Working in this repo

- Keep throwaway UI versions in `.scratch/todos/prototypes/`, which is not part of the repo and stays on the laptop. The Ink ones run with `npx tsx` and need `/** @jsxRuntime automatic */` at the top because they sit outside `src`. Copying the real component and giving it a made-up client keeps the look exact.
- Check a prototype headless on a tmux socket of its own, never the one I may have it open on. Ink takes a few seconds to start under `npx tsx`, and keys sent together arrive as one input, so send them one at a time.
- To run a test Instance from inside a Session, unset `TODOS_API_URL`, `TODOS_THREAD` and `TODOS_LAUNCH_DIR` as well as setting `TODOS_HOME`, `TODOS_PORT` and `TODOS_TMUX_SOCKET`. If it still finds the real API, the launcher refuses to stop it and says so.
- Sessions that were already running keep their old MCP server until they are started or resumed again, so they only get new tools after that. Hooks run fresh every time.
- Several Sessions can work in this repo at once, so commit only your own changes, and ask before touching changes that are not yours.
- A change that adds a new requirement, such as a tool or a version of one that todos needs to run, adds it to the list under "Requirements" in `README.md`.

### UI changes

For anything about how the TUI or the web app looks or feels, build a quick throwaway version with made-up data that I can run and try, and get my feedback on that before changing the real thing. Trying it is easier than talking about it.

Motion is part of how something looks and feels, so every throwaway version includes its motion, following `docs/animation.md`. Work out what I would expect to happen for each action, suggest how it could move, describing the options before building them, and let me try them in the throwaway version. If an action needs motion the principles do not cover yet, say so, and update `docs/animation.md` once I have agreed.

### From an issue to my running todos

1. **Start from an issue.** Every change has an issue before the code changes, even a typo. Whoever finds the work writes it, and an issue an agent writes starts as `needs-triage`. Only I say an issue is ready. Asking for something to be done now counts, so write the issue, note that I asked for it, and do the work. Work you find on your own is written as an issue and left for me, as "Close the feedback loop" below says.
2. **Build it in a test Instance.** Build and try the change in a test Instance on the laptop (see "Working in this repo"), never in the hosted Instance.
3. **Prove it locally.** I try a bigger change myself in the test Instance. A smaller fix is proved by a test that failed before the fix, or by running it. Run the tests and fix any that fail.
4. **Review it.** Review everything changed for the issue, following `docs/agents/review.md` (`/ponytail-review` does this). Each finding becomes an issue. Fix the must-fixes before shipping, and leave the rest for me.
5. **Record it.** Update `CONTEXT.md`, the ADRs and the issue with anything that changed while building it.
6. **Ship it.** Commit, following `docs/agents/commits.md`. Shipping is pushing to main. GitHub Actions then runs the tests, and if they pass it applies any new D1 migrations to the hosted database, builds the web app and deploys the Worker, so nobody runs `wrangler deploy` or applies a migration from a laptop. For now I push, so a subagent commits and stops. Once the deploy on GitHub has passed, run `npm run build` on the laptop, after a pull if the commit came from elsewhere, so my running todos picks up the new build by itself. Ask me before pushing a change where the clients must change first, and build and push the laptop side before the Worker change lands on main.
7. **Check it in my running todos.** Tick each acceptance criterion you have checked there. A check only I can do stays unticked: make a Task for me with every step of the check in its Notes, set the issue to `ready-for-human`, and name the Task in the issue. The issue is done once every criterion is ticked.
8. **Bring the Thread up to date and stop.** Rewrite the Thread's Notes whole, then its Summary and Next step from them, and do the same for any Thread above it that tracks the work. Then wait for my feedback before starting the next issue, unless I have said to work through several in a row.

After each big piece of work, and whenever I ask, run an audit: the same checks as a review, over the whole repo.

### Close the feedback loop

Whenever you see a bug, hear me ask for a feature, or notice a chance to improve something, write it as an issue straight away, even in the middle of other work, and then carry on with what you were doing. It starts as `needs-triage`, and I review it. Nothing noticed is left only in a conversation, because a conversation ends and an issue does not.

### Changing the API

The Worker ships before the laptop's build, so the hosted API never meets a client newer than itself. Change the API by expand and contract. Add the new thing alongside the old one, so an older TUI, an open web app tab and Sessions still running an old MCP server keep working. Remove the old thing in a later change, once nothing still uses it, and keep that removal as an issue until it is done. A change where the clients must change first ships the other way round: the laptop side is built and pushed first, and the Worker change lands on main after it. Refusing anything but JSON was one of these.

Change the schema by expand and contract too. CI applies new D1 migrations before it deploys the new Worker, so for a short time the Worker already running meets the new schema, and it keeps meeting it if the deploy then fails. A migration therefore only adds what the running Worker ignores, such as a new table or a column with a default. Dropping or renaming anything waits for a later change, once no running Worker uses it.
