# todos

todos is a to-do app in the style of Getting Things Done (GTD).

## Install

### Requirements

Install these first:

- Node 22.13 or later
- tmux 3.3 or later
- Claude Code, signed in, so that `claude` starts a session
- nvim 0.10 or later, which Thoughts is written in
- git

Any change to todos that adds a new requirement adds it to this list.

### Set up a local Instance

#### 1. Clone the repository

The repo on GitHub is private. A computer that only runs todos can read it with a read-only key, so it never has to sign in to GitHub. Use a deploy key over SSH. If SSH does not get through, use a token over HTTPS instead.

With a deploy key:

1. Make a key on the computer:

   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/todos_deploy -N ""
   ```

2. On GitHub, open the repo's Settings, then Deploy keys, and add the contents of `~/.ssh/todos_deploy.pub`. Leave "Allow write access" off.

3. Clone with that key, and tell git to keep using it for this repo:

   ```sh
   GIT_SSH_COMMAND='ssh -i ~/.ssh/todos_deploy -o IdentitiesOnly=yes' git clone git@github.com:<owner>/todos.git
   cd todos
   git config core.sshCommand 'ssh -i ~/.ssh/todos_deploy -o IdentitiesOnly=yes'
   ```

With a token:

1. On GitHub, make a fine-grained personal access token that can see only this repo, with Contents set to read-only.

2. Clone over HTTPS. When git asks, give your GitHub user name and paste the token as the password:

   ```sh
   git clone https://github.com/<owner>/todos.git
   cd todos
   ```

3. So that git does not ask on every update, let it remember the token, for example with `git config credential.helper osxkeychain` on a Mac or `git config credential.helper store` elsewhere. `store` keeps the token in plain text in `~/.git-credentials`.

#### 2. Build it

```sh
npm install
npm run build
npm link
```

`npm link` puts the `todos` command on your path.

#### 3. Start it

Run `todos` from the folder you want new Sessions to start in by default. The first time, it starts the todos API in the background, starts todos' own tmux server and opens Home. Home is empty until you add a Thread with `A`.

The web app is served by the same API, at http://127.0.0.1:7316.

Data lives in `~/.todos`. Set `TODOS_HOME` to keep a separate copy somewhere else, and `TODOS_PORT` if the default port 7316 is taken. `TODOS_TMUX_SOCKET` names the tmux server todos uses, which is `todos` by default.

#### Back up

`todos backup FOLDER` copies the data into `FOLDER/todos-YYYY-MM-DD.db` and keeps the newest 30. It is safe while todos is running. Point it at a folder a cloud drive syncs, and run it once a day, for example from cron or launchd. Do not put `~/.todos` itself in a synced folder: SQLite keeps recent writes in a second file, and a sync can copy the two at different moments and corrupt the data.

### Keep it up to date

From the repo folder:

```sh
git pull && npm install && npm run build
```

A running todos picks up the new build by itself. When `npm run build` writes new code, the API restarts into it, and Home replaces itself in its pane, which also reloads the tmux config. That covers:

- migrations, because the local API applies any new files in `migrations/` when it starts
- the API
- the web app, which the API serves from the new build, so reload the page
- Home and the tmux config

Sessions in other windows are not touched. The MCP server inside a Session that is already running keeps its old code, so the Session gets new tools only when it is next started or resumed. Hooks run fresh every time, so they change at once.

Running `todos` also replaces an API or Home that is running an older build.

### Hosting

The hosted Instance runs on Cloudflare as a Worker on D1, behind Cloudflare Access. Its config lives in `wrangler.jsonc` at the repo root, which git ignores because it names your own domain, Access team, Access app and D1 database. The tests use `wrangler.example.jsonc` as it is, so they need no hosting config.

Nobody deploys from a laptop. A push to main runs the tests on GitHub Actions, and if they pass, the same workflow (`.github/workflows/test.yml`) writes `wrangler.jsonc` from `wrangler.example.jsonc`, applies any new D1 migrations to the hosted database with `npx wrangler d1 migrations apply todos --remote`, builds the web app and deploys the Worker with it. If a migration fails, nothing is deployed. The values it fills in are repository variables on GitHub: `ROUTE_PATTERN` (the custom domain), `ACCESS_TEAM`, `ACCESS_AUD` and `D1_DATABASE_ID`. The Cloudflare API token and account id are the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Make the Cloudflare API token an Account API token from the "Edit Cloudflare Workers" template, and add D1 Write to it. Scope D1 and the Workers permissions to the account, and Workers Routes to the one zone the custom domain is in. A narrower token fails. With D1 scoped to a Worker or a zone, applying the migrations fails with error 7403, and with the Workers permissions scoped to one Worker, the deploy fails with "No access to the specified service".

Once the deploy has passed, run `git pull && npm install && npm run build` on each computer as usual.

Every computer that uses a hosted Instance needs its own `wrangler.jsonc`, copied from `wrangler.example.jsonc` and filled in the same way, because `todos backup` runs `wrangler d1 export` with it to back up the hosted data. A computer with only a local Instance needs none.

## How it works

todos keeps two kinds of thing. A Task is a single action, such as "Call the landlord". Tasks sit in lists such as Inbox, Today and Anytime, and a Task can have a Date on which it moves into Today. A Thread is an outcome being worked towards, such as "Set up the domain". Threads form a tree. Each Thread has a Summary, a Next step and notes, and says whose move it is.

A Thread can have a Session. A Session is a Claude Code session that works on the Thread in a folder on disk. todos gives every Session tools to read and update its Thread, so the Thread always says where the work stands.

There are two ways to use todos. In the terminal, `todos` opens Home, a screen that shows the tree of Threads you are working on now. From Home you go into a Thread's Session, and you come back to Home to go to another one. Each Session runs in its own window of a tmux server that belongs to todos. In a browser, the web app shows the same Threads and Tasks.

One todos, with its own data and its own API, is called an Instance. An Instance runs in one of two ways. A local Instance runs on your computer and keeps its data in a SQLite file. A hosted Instance runs on Cloudflare as a Worker on a D1 database. The two work the same way and never share data.

`CONTEXT.md` explains the words used here, and `docs/adr/` explains the main decisions.

### Home

| Key | What it does |
| --- | --- |
| `j` `k` or `↑` `↓` | Move through the tree |
| `[` `]` | Jump to the previous or next On me Thread |
| `e` | Switch the Thread between On me and Waiting |
| `s` | Park an Active Thread in Someday, or bring it back into Active |
| `x` `X` | Mark the Thread Done or Dropped; the same key again reopens it |
| `a` | Add a Thread under the selected one, typed in place in the tree |
| `A` | Add a top-level Thread after the one you are in, typed in place |
| `J` `K` | Move the Thread down or up among its siblings |
| `z` | Fold or unfold the selected Thread; on a Thread with no children, fold its parent |
| `Z` | Unfold everything if anything is folded, otherwise fold everything |
| `f` | Focus on the Thread and everything under it; `f` again or `Esc` leaves |
| `/` | Search titles; `n` `N` go to the next or previous match, `Esc` clears it |
| `.` | Also show the Someday Threads and the ones waiting for a day, which you could bring in |
| `,` | Show the Done and Dropped Threads |
| `Enter` | Go into the Thread's Session, starting or resuming it if needed |
| `q` | Leave todos running and go back to the terminal |

Inside a Thread, `Alt+h` goes back to Home. On Home and in every Thread, `Alt+x` opens the task panel, `Alt+g` opens Thoughts, one page of free text along the bottom, written in nvim and saved by itself, and `Alt+c` opens a small box to capture a Task into the Inbox. Pressing `Alt+x` or `Alt+g` again puts it away. These keys also work on a Mac whose terminal does not send Option as Meta.

### Develop

```sh
npm run watch      # rebuild on every change, so a running todos updates live
npm test
npm run typecheck
```
