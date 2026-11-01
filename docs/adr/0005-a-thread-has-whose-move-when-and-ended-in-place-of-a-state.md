# A Thread has whose move, When and Ended in place of a state

A Thread used to be in exactly one state: Working, On me, Waiting, Someday, Done or Dropped. That one field answered three different questions: who acts next, whether the Thread is for now, and whether it has ended. So a parked Thread could not say whose move it was, and bringing it back meant setting that again by hand, and a Thread that never ends, such as an area of my life, fitted none of the states.

A Thread now has three separate facts, each named for what it holds, as a Task already keeps its list apart from whether it has ended:

- **Whose move**: On me or Waiting, set by its Session or me. Working is not stored; it comes from the Session being busy and is worked out when the Thread is shown.
- **When**: Active, Someday, or a day on which it moves into Active by itself. Active is the set of Threads I am working on now, which only I choose, and Home shows it.
- **Ended**: not ended, Done or Dropped.

In code no field is null; every case has a name, and a case carrying a day is a tagged union:

    whoseMove: 'on_me' | 'waiting'
    when: {kind: 'active'} | {kind: 'someday'} | {kind: 'on_day', day: '2026-04-06'}
    ended: 'not_ended' | 'done' | 'dropped'
    deadline: {kind: 'none'} | {kind: 'by_day', day: '2026-11-14'}

Because the day is part of When, a Thread cannot have a day and be Someday at once. Tasks take the same shapes for Ended, Deadline and When.

## Considered options

- Keeping one state and adding Active as another value. Rejected because Active is a choice about focus, made by me, while On me and Waiting describe the work and are set by Sessions, so one field would mix my choice with a Session's report, which is the problem this solves.
- Separate fields named `state` and `status`, or a `state` holding only whose move. Rejected because a generic name can hold anything, which is how Someday, a question of when, ended up among the answers to whose move.
- A middle group of Threads that are open, not Active and not Someday. Rejected because everything in todos is something I want to do, so not now is Someday, and a middle group would only bury the ideas I sift for in Someday.
- A separate kind of Thread for areas. Rejected because an area is just a Thread that is never Done or Dropped: Active while I work in it, Someday when it is quiet. A new kind would bring its own rules and screens. ADR 0006 later made areas, with projects, things of their own beside Threads, which keeps Threads as they are.
- `null` for "no day", "no deadline" or "not ended". Rejected because a null hides what it means.

## Consequences

- Stored data changes: Someday Threads become Someday with whose move On me, Done and Dropped Threads become Ended, and every other Thread goes into Active, so Home looks the same on the first day and I prune Active afterwards.
- The API and the MCP tools take the new fields alongside `state`, so an older TUI, an open web app tab and Sessions still running an old MCP server keep working. `state` is removed in a later change once nothing uses it.
- Tasks rename `state` to `ended`, and join `place` and `date` into one `when`, by the same expand and contract.
- Later decided (issue 95): with one user who restarts any Session that breaks, the Task fields were replaced straight away and Thread `state` removed with them, with no waiting. The API refuses `state`, `place`, `date` and `done` with a message saying to restart the Session or reload the page, so no change from an older client is dropped without a word.
- The database still stores a missing day as an empty column; storage turns it into a named case when it reads, so no null passes it.
