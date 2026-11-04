# Animation

How todos moves, in the TUI and the web app. Every UI change follows this file.

## Why todos moves

When I do something, I already picture what should happen. Pressing New, I expect a fresh line to appear and be the thing I am now writing. Ticking off a Task, I expect it to be finished and out of my way. Motion is that expectation shown on the screen, so what I see matches what I pictured and I understand what changed without reading or thinking.

So before any action is animated, the first question is what I expect to happen when I take it. The motion shows that and nothing more. A motion that surprises me is wrong however good it looks, and so is a change with no motion where I expected one, such as a Task vanishing when I expected it to move.

A change I did not make, such as a Session ticking off a Task or something added on another device, was not expected, so it arrives quietly: it fades into its place, nothing slides or grows, and what I am looking at stays where it is. The shimmer on a Working Thread is not such a change, because it shows a steady state and not something that happened once.

How things move, such as their weight, speed and the way they settle, is the language this is said in. It comes from trying demos, and is written below as it is agreed.

## The principles

1. **Things come from where I asked for them and go where they belong.** A new Task rises from the + button. A Task moved to another list travels into that list in the sidebar. Esc sends a thing back where it came from.
2. **Focus means the rest steps back.** While I make or open one thing, everything else dims to 30% and blurs slightly, and comes back when I am done. Nothing shrinks or zooms out, because that pulls the whole page away instead of bringing one thing forward. A small edit in place, such as renaming, does not step anything back.
3. **Nothing jumps.** Every gap opens and closes smoothly, and every row that changes place glides there.
4. **A thing stays itself.** What I made or moved is never swapped for something else with a flicker: a new line becomes the selected Task, and an open Task shrinks back into its own row.
5. **Plain motion only.** Things move, fade, blur and change size. Nothing glows, bounces, sweeps or ripples.

A motion takes about 280ms and eases out, starting quickly and slowing as it settles. Something that travels far, such as a line rising from the bottom of the screen, takes about twice that. A change I did not make moves about two and a half times slower, so it never pulls the eye. A change counts as mine when I pressed a key or clicked in the 1.5 seconds before it is drawn, and any other change is taken to be one I did not make. The web app tells the two apart on the Threads page and in its lists of Tasks, and the TUI does not yet.

## Each action

- **New:** a line rises from the + button to just after the selected Task, or to the top when nothing is selected. The list opens a little space around it and the rest steps back. Enter settles it and it becomes the selected Task; Esc sends it back down.
- **Tick off or drop:** the Task greys at once, stays where it is for half a second so I see it done, then glides to the bottom. Opening it again glides it back to its place. It leaves for the Logbook when the view changes.
- **Open a Task:** its card grows out of its row while the rest steps back, and shrinks back into the row when closed.
- **Move to another list:** the Task travels into that list in the sidebar, and the gap it leaves closes.
- **Capture:** a line rises from the bottom while everything steps back, then travels into the Inbox: into its place when the Inbox is shown, and into the Inbox in the sidebar otherwise.
- **Reorder:** the rows glide past each other.
- **Switch lists:** the new list fades in without travelling, because nothing moved.
- **Rename:** the title becomes editable in place, with no motion.
- **Open the sidebar on the phone:** a swipe to the right from anywhere on the page pulls the sidebar out from the left, one to one with my finger, so it stops when I stop and carries on when I carry on, while the page behind darkens as it comes. Letting go past a third of the way, or with a flick, opens it the rest of the way; otherwise it slides back. A swipe to the left closes it the same way. Picking a page in it closes it before the step is added to the browser's history, so Safari's back swipe shows the page as it was, not the sidebar.
- **A change a Session makes:** a new Task fades in while the rows make room slowly; a Task it ends greys where it is and does not move.

## Threads

Home and the web app's Threads page move a Thread the same way when it leaves the view. Home draws in a terminal, so where the Threads page fades a row out and glides the rows below it up, Home's rows close up at once.

- **Park:** sending an Active Thread to Someday, or on the Threads page to a later day, dims it at once, and it stays in its place for half a second so I see what happened. Then it leaves and the gap closes. On the Threads page it fades out where it was in about 280ms while the rows below glide up.
- **End:** marking a Thread Done or Dropped dims it and tags it "done" or "dropped" beside its title, where it is. It stays there until I select another Thread or change view, then leaves as a parked Thread does. This differs from ticking off a Task, which glides to the bottom of its list.

The rest is the Threads page's own. A row that changes place glides there in 280ms, plus a little more the farther it goes, up to 430ms.

- **Pick a Thread:** its row's highlight fades in over 300ms, and the column of its children fades in where it stands in about 280ms. Columns that no longer apply fade out. Nothing slides on each j or k.
- **Add a Thread:** from the Child Thread button, the new row travels from the button into its place in about 450ms. With A or a, the rows glide apart where it goes and it fades in. While I type, the rest steps back. Enter keeps the row where it is until the Thread is made, then it settles there as the selected Thread. Esc, or leaving it empty, sends it back to the button, fading as it goes, or fades it where it is and closes the gap.
- **Move to:** the row travels into its new parent's row, fading as it goes, in about 450ms, and the gap it leaves closes. When the new parent is not on screen, the row fades out where it was. Then the columns fade to show it in its new place, still selected.
- **Open a Thread on its own page:** on the laptop the page grows out of the Thread's row while it fades up from 40%, in about 450ms, and Back to columns shrinks it back into the row the same way. Opening or closing it with the browser's Back or Forward does not grow or shrink it.
- **Go into a Thread on the phone:** its screen slides in from the right over the one I left, in about 390ms, and going back, by the button or a back swipe, slides it out to the right.
- **Bring in:** the Active Threads stay where they are, gaps open where the parked and dated Threads go, and those rows fade in dimmed. Pressing it again fades them out and closes the gaps.
- **Ended:** the list fades in as a new list without travelling, as switching lists does.

## Dragging

Anything that can be dragged can be dropped on anything on screen that can hold it, and dropping it there makes it belong there, as choosing that place from its menu would. While it is over a place that can hold it, that place shows it will take it, and a place that cannot hold it shows nothing.

Dragging uses the drag library's own timings, which are a little quicker than the rest: rows glide apart in 200ms and a dropped card settles in 250ms. On the phone a drag starts only after a long press, so a swipe always scrolls or opens the sidebar.

- **Tasks:** the Task lifts out as a card under the pointer, with a count when other selected Tasks go with it. Its row stays behind at 40% to show where it will land, the other selected Tasks dim to 40% where they are, and the rows glide apart around it. Letting go in the list settles the card into that place. Letting go on a list in the sidebar moves the Task to that list, and it leaves the list I am in without yet travelling there. Esc, or letting go anywhere else, sends the card back to its row.
- **Projects and areas in the sidebar:** a project moves as a Task does. It lifts out as a card, with a count when other picked projects go with it, and the rows glide apart where it would land, among an area's projects when it is over that area. Letting go settles it there. An area is dragged by its row and moves with its projects as one block while the other areas glide past. Esc, or letting go outside the sidebar, sends it back.
- **Threads in a column:** the row itself lifts, on a card with a shadow, and the Threads beside it glide apart. Letting go leaves every row where the drag put it, so nothing glides again.

The demo all of this was agreed on is kept locally in `.scratch/todos/prototypes/animation/`, outside the repo. It imports the web app's real components, such as TaskRow, TaskDetail and TaskMenu, and the core Task types, so it may need fixing after they change. To check that it still fits them, run `npx tsc -p .scratch/todos/prototypes/animation` from the repo root, which uses the `tsconfig.json` in that folder and type checks the demo against the web app's code. Building it with Vite is not enough, because Vite does not check types and still builds when an imported name no longer exists. To try it, run `.scratch/todos/prototypes/animation/run.sh`, which serves it at http://localhost:5180. The TUI carries out the same principles in a terminal's way, which is still to be worked out.
