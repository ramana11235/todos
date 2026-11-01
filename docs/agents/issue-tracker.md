# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on this repo. Use the `gh` CLI for all operations. `gh` finds the repo from `git remote -v` when run inside a clone.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..." --label needs-triage`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`. Add `--json labels,body,comments` to get the fields as JSON.
- **List issues**: `gh issue list --state open --json number,title,labels` with `--label` and `--state` filters as needed.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Close**: `gh issue close <number> --comment "..."`
- **Status**: an issue's Status is one of the triage labels in `triage-labels.md`, and it has exactly one. Change it with `gh issue edit <number> --add-label "..." --remove-label "..."`.
- **Blocking**: use GitHub's own blocking between issues ("blocked by" in the issue's Relationships), not a line in the body.
- **Sub-issues**: work that belongs to a parent issue, such as the tickets of a wayfinder map, is added as sub-issues of the parent. Wayfinder issues carry `wayfinder:` labels, such as `wayfinder:map` on the map.

## The queue

The queue is the repo's GitHub Projects board. Its columns are Needs triage, Ready, In progress, Waiting on me and Done, and each issue has a Lane field. The order within a column is the order of work, so the top of Ready goes next. The board's README holds the queue's rules. Work it with `gh project item-list`, `gh project item-add` and `gh project item-edit`. Moving a card's position needs `gh api`. `gh` needs the `project` scope for this, added with `gh auth refresh -s project`.

## Wayfinding operations

- **Map**: the issue labelled `wayfinder:map`.
- **Tickets**: the map's sub-issues.
- **Claim a ticket**: assign it, with `gh issue edit <number> --add-assignee @me`.
- **Frontier**: the map's sub-issues that are open, not blocked and not assigned.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
