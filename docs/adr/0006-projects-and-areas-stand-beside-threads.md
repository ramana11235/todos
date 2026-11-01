# Projects and areas stand beside Threads

Home showed too much, because Threads were doing three jobs. Some were parts of my life, such as Riana, some were outcomes made of many pieces of work, such as Build todos, and the rest were pieces of work done in a Session. Home is where I go for the work done with Sessions, so the other two crowded it.

todos now has projects and areas as things of their own, beside Threads. A Thread stays exactly as ADR 0005 describes it.

- **Area**: a part of my life that is never finished, such as Health. It has a title, Notes, and whether it is in use or Dropped. It is never Done, and has no When or Deadline.
- **Project**: an outcome made of Threads and Tasks, such as Build todos. It has a title, Notes, the area it is in or none, a Deadline, and Ended (Done or Dropped). It has no Whose move or Session, which belong to its Threads, and no When: it shows wherever its Threads and Tasks show, and parking it means parking its Threads.
- A Thread at the top of its tree belongs to one project, one area or neither, and the Threads under it belong to the same one. A Task links to one Thread, one project, one area or nothing.
- Nothing nests: an area never sits in an area, a project never sits in a project, and a project sits in one area or none. The smaller parts of a project are its Threads, which already nest.
- Home stays a tree of Threads, and a project or area shows in it only as the parent of the Threads in it, with a symbol of its own: ◆ for a project and ■ for an area, in place of a Thread's circle. One shows only when a Thread shows under it, following the view, so a project with only Tasks never shows. The tree lists each project in no area, then each area with its projects and then its own Threads, then the Threads in neither. Selecting a project or area shows its Notes. Its row folds, and a adds a top-level Thread in it, but it has no Session to go into, and the keys that would change it say to change it in the web app, since it has no Whose move or When and ending one asks first when work inside is open. At the top level, J and K move a Thread among those in the same project or area.
- Headings in the tree were tried first and dropped, because the project grouping and the Thread tree were two structures that a narrow list could not show at once without clutter. As parents in the tree they are one structure. Until then a Thread's area and project showed only in its details, which they still do.
- The web app's sidebar lists projects in no area first, then each area with its projects, each with a page of its own.

In code each is its own type with only its own fields, and no field is null:

    area: {title, notes, ended: 'not_ended' | 'dropped'}
    project: {title, notes, area: {kind: 'none'} | {kind: 'in', id}, deadline, ended: 'not_ended' | 'done' | 'dropped'}

## Considered options

- No projects or areas, which issue 43 chose: a Thread is what the Tasks of an outcome link to. Rejected because one Thread then has to be an area, a project or a piece of work, and Home cannot tell them apart.
- Areas, projects and pieces of work as three kinds of Thread, each with only the fields that mean something for it. Tried in a throwaway version, kept locally outside the repo, and rejected. It needed about twenty rules, most of them patching the side effects of earlier ones: projects could not be Waiting, a Session had to be handed to a made-up child Thread when switching kind, a piece of work growing into a project was refused by the nesting order, and parking or ending had to reach across the tree. This is what ADR 0005 foresaw when it rejected a kind of Thread for areas.
- Keeping the model and changing only Home's filter, to show Threads that have a Session. Rejected because it gives the web app no areas or projects, which I want to see there.
- A label on a Thread that changes only where it shows. Rejected because a Thread marked as an area would still carry a Whose move, a When and a Done it never uses.

## Consequences

- This reverses "No Projects" from issue 43 and the line in ADR 0005 that an area is a Thread that is never Done. CONTEXT.md changes once the throwaways have been tried.
- Ending a project or dropping an area changes nothing inside it, as ending a Thread changes nothing else. The web app asks me to confirm when something in it is still open, and that open work keeps showing under its project, marked Done.
- Moving a Thread under another gives it the project of the tree it lands in; moving it to the top level keeps its project. Taking it out of a project is its own action.
- Sessions get MCP tools to do everything with projects and areas that I can.
- Existing Threads that are really projects or areas are moved over once, by hand, with me deciding each one. There is no lasting action to turn a Thread into one.
