# Animation

How todos moves, in the TUI and the web app. Every UI change follows this file.

## Why todos moves

When I do something, I already picture what should happen. Pressing New, I expect a fresh line to appear and be the thing I am now writing. Ticking off a Task, I expect it to be finished and out of my way. Motion is that expectation shown on the screen, so what I see matches what I pictured and I understand what changed without reading or thinking.

So before any action is animated, the first question is what I expect to happen when I take it. The motion shows that and nothing more. A motion that surprises me is wrong however good it looks, and so is a change with no motion where I expected one, such as a Task vanishing when I expected it to move.

A change I did not make, such as a Session ticking off a Task or something added on another device, was not expected, so it arrives quietly: it fades into its place, nothing slides or grows, and what I am looking at stays where it is. The shimmer on a Working Thread is not such a change, because it shows a steady state and not something that happened once.

How things move, such as their weight, speed and the way they settle, is the language this is said in. It comes from trying demos, and is written below as it is agreed.

## The principles

1. **Things come from where I asked for them and go where they belong.** A new Task rises from the + button. A Task moved to another list travels into that list in the sidebar. Esc sends a thing back where it came from.
2. **Focus means the rest steps back.** While I make or open one thing, everything else dims to 30%, blurs slightly and shrinks a little, and comes back when I am done. A small edit in place, such as renaming, does not step anything back.
3. **Nothing jumps.** Every gap opens and closes smoothly, and every row that changes place glides there.
4. **A thing stays itself.** What I made or moved is never swapped for something else with a flicker: a new line becomes the selected Task, and an open Task shrinks back into its own row.
5. **Plain motion only.** Things move, fade, blur and change size. Nothing glows, bounces, sweeps or ripples.

A motion takes about 280ms and eases out, starting quickly and slowing as it settles. Something that travels far, such as a line rising from the bottom of the screen, takes about twice that. A change I did not make moves about two and a half times slower, so it never pulls the eye.

## Each action

- **New:** a line rises from the + button to just after the selected Task, or to the top when nothing is selected. The list opens a little space around it and the rest steps back. Enter settles it and it becomes the selected Task; Esc sends it back down.
- **Tick off or drop:** the Task greys at once, stays where it is for half a second so I see it done, then glides to the bottom. Opening it again glides it back to its place. It leaves for the Logbook when the view changes.
- **Open a Task:** its card grows out of its row while the rest steps back, and shrinks back into the row when closed.
- **Move to another list:** the Task travels into that list in the sidebar, and the gap it leaves closes.
- **Capture:** a line rises from the bottom while everything steps back, then travels into the Inbox: into its place when the Inbox is shown, and into the Inbox in the sidebar otherwise.
- **Reorder:** the rows glide past each other.
- **Switch lists:** the new list fades in without travelling, because nothing moved.
- **Rename:** the title becomes editable in place, with no motion.
- **A change a Session makes:** a new Task fades in while the rows make room slowly; a Task it ends greys where it is and does not move.

The demo all of this was agreed on is kept locally in `.scratch/todos/prototypes/animation/`, outside the repo. It imports the web app's real components, such as TaskRow, TaskDetail and TaskMenu, and the core Task types, so it may need fixing after they change. To check that it still fits them, run `npx tsc -p .scratch/todos/prototypes/animation` from the repo root, which uses the `tsconfig.json` in that folder and type checks the demo against the web app's code. Building it with Vite is not enough, because Vite does not check types and still builds when an imported name no longer exists. To try it, run `.scratch/todos/prototypes/animation/run.sh`, which serves it at http://localhost:5180. The TUI carries out the same principles in a terminal's way, which is still to be worked out.
