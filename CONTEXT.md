# Todos

A personal app for capturing small tasks the moment they occur and for tracking the bigger outcomes being worked on in parallel, many of them through Claude sessions.

## Language

### Threads

**Thread**:
An outcome being worked towards, named by its title, with a **Summary**, a **Next step**, a **Whose move**, a **When** and an **Ended**. The title starts with an action verb and says its purpose in a few words, such as "Set up the domain".
_Avoid_: Project, workstream, session

**Summary**:
A few short bullet points in simple words on a **Thread** saying what it is about and where it stands, written for me and drawn from its **Notes**. Everything else belongs in the **Notes**. The **Thread** keeps when it, or the **Next step**, last changed.
_Avoid_: Status, description, notes

**Next step**:
A short sentence on a **Thread** naming the single next piece of work that moves it forward, such as building an issue or a grilling session, not the next small step within it; it is not a **Task**. On a **Waiting** **Thread** it says who or what it waits on.
_Avoid_: Next action, next task

**Notes**:
The full detail behind a **Thread** or a **Task**, as plain text with no set shape. A **Task**'s **Notes** are written by me, or by a **Session** when it makes the **Task** for me, holding every step I need to do it. A **Thread**'s are mostly written by its **Session**: everything a later **Session** needs to pick up the work. A **Thread**'s **Notes** are the source and the **Summary** is the short version of them for me, so the **Summary** never says anything the **Notes** do not.
_Avoid_: Log, journal, handoff

**Whose move**:
Who acts next on an open **Thread**: **On me**, **Waiting**, or **Working** while its **Session** is busy. It is shown on the **Thread**'s row and never decides where the **Thread** shows.
_Avoid_: State, status

**Working**:
The **Whose move** of a **Thread** whose **Session** is busy right now.

**On me**:
The **Whose move** meaning the next move is mine, including when its **Session** is asking me something, and when the next move is the **Session**'s own, because it does nothing until I prompt it.
_Avoid_: Needs me, asking

**Waiting**:
The **Whose move** meaning the next move belongs to someone or something else, such as a person, CI or a delivery, which its **Next step** names.
_Avoid_: Blocked

**When**:
Where an open **Thread** sits: **Active**, **Someday**, or a day on which it moves into **Active** by itself. It is the counterpart of a **Task**'s list and **Date**.
_Avoid_: State, status

**Active**:
The **Threads** I am working on now. Which **Threads** are **Active** is my choice alone: I bring them in and prune them myself, so the set stays alive and never goes stale. **Home** shows them.
_Avoid_: Focus, current, Anytime

**Someday**:
A **Thread** or **Task** I want to do, but not now, kept out of sight until I look. Going into **Someday**, in the web app or with **Home**'s view of what I could bring in, is looking. It is the pool I sift for what to bring in next. Something I no longer want is **Dropped**, not left in **Someday**. A **Someday** **Thread** is still open.

**Done**, **Dropped**:
The two ways a **Thread** or a **Task** ends: the outcome was reached, or it was given up. A **Thread** or **Task** that has not ended is open. Which of the three it is, is its **Ended**.
_Avoid_ for **Ended**: State, status
_Avoid_: Closed, completed, cancelled, archived

**Directory**:
The place on disk a **Thread**'s **Session** works in.
_Avoid_: Folder, workspace, repo

### Projects and areas

**Project**:
An outcome made of **Threads** and **Tasks**, such as Build todos, which sits in one **Area** or in none. It has a title, **Notes**, a **Deadline** and an **Ended** (**Done** or **Dropped**), but no **Whose move**, **Session** or **When**, which belong to its **Threads** and **Tasks**.
_Avoid_: Workstream, epic

**Area**:
A part of my life that is never finished, such as Health, holding **Projects**, **Threads** and **Tasks**. It has a title and **Notes**, and is in use until it is **Dropped**; it is never **Done** and has no **When** or **Deadline**.
_Avoid_: Category, folder

### Sessions

**Session**:
A Claude session attached to a **Thread**, which keeps that **Thread** up to date as it works.
_Avoid_: Agent, chat

### Tasks

**Task**:
A single action, which is open until it is **Done** or **Dropped**. Like a **Thread**'s title, it starts with an action verb and is very short, such as "Call the landlord".
_Avoid_: Todo, item, action

**Inbox**:
The place where captured **Tasks** wait until I move them somewhere. A **Task** that belongs to a **Thread**, a **Project** or an **Area** has been sorted, so it is never in the **Inbox**: linking a **Task** in the **Inbox** moves it to **Anytime**, and a **Task** added with a **Thread**, **Project** or **Area** and no list goes to **Anytime**, wherever it happens. Unlinking a **Task** leaves it where it is, and a **Task** in another list keeps its list when linked.

**Today**:
The **Tasks** that must be done today. A **Task** goes here only if it really needs doing that day, so nothing drifts from day to day.

**Anytime**:
The **Tasks** actively on my mind, and the list I pick from when I am ready to work.

**Upcoming**:
The **Tasks** that have a **Date** still ahead, and the **Threads** with a day still ahead, under a heading for each day. Within a day they are grouped by **Thread** as in any list, but not by **Project** or **Area**, so **Upcoming** never has more than two levels of headings.

**Date**:
A day set on a **Task** on which it moves into **Today** by itself; until then it is listed in **Upcoming**.
_Avoid_: Start date, scheduled, due date

**Reminder**:
A day and a time on a **Task** or a **Thread** when todos tells me about it, with a quiet dot on a bell in the web app. It is separate from a **Date** or a **Thread**'s day and moves nothing; each has at most one.
_Avoid_: Alert, alarm

**Deadline**:
An optional day by which a **Task** must be done, or a **Thread**'s whole outcome reached, separate from a **Task**'s **Date**; it never hides anything.
_Avoid_: Due date

**Checklist**:
Steps inside a **Task**, each ticked off on its own. A step is not a **Task**: it is in no list and has no **Date**.
_Avoid_: Subtasks

**Logbook**:
Where **Done** and **Dropped** **Tasks** are listed, most recent first, so nothing finished is lost from sight.
_Avoid_: Archive, history

**Capture**:
Recording a **Task** in a few seconds, at the moment it occurs, without deciding anything about it; a captured **Task** always lands in the **Inbox** with no **Thread**.

**Clarify**:
What I do in a quiet moment when I go through the **Inbox** and move each **Task** somewhere; it is my habit, not a feature or step in the app.

### Thoughts

**Thoughts**:
Where I write down thinking that is still forming, while **Sessions** run, and come back to rework it. Nothing in it is a **Task**; when a thought is ready to act on I **Capture** it.
_Avoid_: Notes, scratchpad, journal, ideas

### Screens

**Home**:
The screen in the terminal that shows the tree of **Active** **Threads**, and the only place to move from one **Thread** to another. The word names that screen and nothing else.
_Avoid_: Dashboard

**Threads page**:
The page in the web app that shows the tree of **Threads** as columns, each listing the children of the **Thread** picked in the one before, beside the picked **Thread**'s details. It is the web app's counterpart of **Home**: the one place there to pick a **Thread**.
_Avoid_: Projects, Thread list

### Instances

**Instance**:
One todos with its own data and its own API. A local **Instance** runs on a laptop against a SQLite file; the hosted **Instance** runs on Cloudflare. **Instances** never share data, and each **Home** uses exactly one.
_Avoid_: Copy

**Settings**:
The choices I make about how one **Instance** looks, kept with that **Instance** so every browser, device and **Home** showing it follow them. The first is the **Accent colour**.
_Avoid_: Preferences, options, config

**Accent colour**:
The colour todos draws its highlights in, blue unless I pick another. Giving each **Instance** its own lets me tell them apart at a glance.
_Avoid_: Theme

## Relationships

### Whose move, When and Ended

- A **Thread** has three separate facts besides its text: its **Whose move**, its **When** and its **Ended**. Each is named for what it holds, and none is called a state (ADR 0005)
- Every open **Thread** is either **Active** or **Someday**, or has a day; there is nothing in between
- Its **When**, and whether it is **Done** or **Dropped**, are set only by me, or by a **Session** when I tell it to, and they hold even while a **Session** runs. A **Session** that thinks its **Thread** could be parked says so and waits for me
- The **Whose move** comes from the **Session**: **Working** while it is busy, **On me** while it is asking me something, and whatever it last set (**On me** or **Waiting**) once it finishes its turn
- A **Thread** with no **Session**, or whose **Session** has gone, keeps the **Whose move** last set on it
- Parking a **Thread** in **Someday** and bringing it back into **Active** keeps its **Whose move**
- A **Someday** **Thread** stays hidden on **Home** even while its **Session** is working or asking me something, because I started that **Session** myself
- A day on a **Thread** is the day it comes back: until then it sits with **Someday**, and on that day it moves into **Active** by itself, keeping its **Whose move**, as a **Task**'s **Date** moves it into **Today**. It is not a **Reminder** and never means the outcome must be reached that day; that is its **Deadline**. A day means the same for **Threads** and **Tasks**. Giving a **Thread** a day takes it out of **Someday**, and putting it in **Someday** takes the day away
- A new **Thread** starts **Active**, whether I make it or a **Session** makes it because I asked, unless I say to park it
- A **Session** updates its **Thread** without being asked at milestones only: a piece of work or an issue landing, the end of a planning or grilling session, the **Thread** starting or stopping waiting, the **Next step** passing between me and the **Session**, or making something worth linking. A small decision is not a milestone; it goes in the repo's own files, such as the issue being worked on, because every update costs tokens and a request
- Every update changes the **Notes** first and then the **Summary** from them, so the two never drift apart. The **Notes** are plain text with no set shape. An update usually changes only the passage that moved; the **Session** rewrites them whole at a point worth picking up from, and before it stops for my feedback on finished work, such as a built issue or a prototype to try. A question to me in the middle of the work is not such a stop
- Nothing reminds a **Session** to update its **Thread**. Keeping it true is the **Session**'s own job, because a reminder can only see that work happened, not whether it was a milestone, so it pushed updates after small steps
- **Home** never shows a **Thread**'s **Notes**; the web app shows them folded under the **Summary** until I unfold them
- **Home** shows a **Project** or an **Area** as the parent of the **Threads** in it, with a symbol of its own, and only when a **Thread** shows under it, so **Home** stays a tree of **Threads**. Selecting one shows its **Notes**, but it has no **Session** to go into and is changed only in the web app (ADR 0006)
- A **Session** is handed its **Thread**, **Notes** and all, when it starts and is told to pick it up: it reads everything the **Thread** points to, says where it stands and waits for my instruction. Saying "pick up" later does the same
- A **Session** that thinks its **Thread** is finished says so in the **Next step** and sets it **On me**
- A **Done** or **Dropped** **Thread** can be reopened
- A **Thread** can have a **Deadline** when its outcome is tied to a day, such as a party on 14 November, because that day belongs to the outcome and not to any one step. It looks as a **Task**'s does wherever the **Thread** shows, and it never moves the **Thread** anywhere
- I set a **Thread**'s **Deadline**; its **Session** sets or clears it only with a day I told it or that it found in something I gave it, never a guess

### The tree

- A **Thread** can have child **Threads**, and a child **Thread** has exactly one parent; a **Thread** with children is still just a **Thread**, with all the same fields, and nothing about it is worked out from its children
- A **Thread**'s children are the work that must happen before it can be done, and siblings never depend on each other, so they can be worked on at the same time. Reading the tree from the leaves up shows what needs to happen to reach the top, and the open leaves are what can be worked on now
- If two **Threads** seem to need the same work, the tree is arranged wrong: the shared work belongs under one of them, or the two are not really separate. A **Thread** never has two parents
- Moving is the one way to rearrange the tree: a **Thread** moves under another **Thread** or out to the top, taking its children, **Tasks** and **Session** with it
- When two **Threads** turn out to be the same outcome, one keeps going: the other's children and open **Tasks** move to it, what matters from the other is written into it, and the other is **Dropped** with a **Summary** naming the one that kept going. Nothing is ever deleted
- The order of siblings means only what I want it to mean, usually priority
- Ending a **Thread** changes nothing else: its child **Threads** and its open **Tasks** stay as they are, and I deal with them myself
- **Home** shows the **Active** **Threads**. One key also shows the **Threads** I could bring in, the **Someday** ones and those with a day ahead, dimmed in the same tree and showing their day; ended **Threads** have a view of their own, like the **Logbook**, and never mix in. A hidden **Thread** shows dimmed when an **Active** **Thread** sits below it
- A **Directory** is optional; a **Thread** without its own **Directory** uses its nearest ancestor's, and any **Thread** can set its own to override it
- A **Directory** can be set before the folder exists, but a **Session** only starts once it does. Going in from **Home** says there is no folder there and stays on **Home**, and a prompt waits as it does for a **Thread** with no **Directory**
- A pane I split in a **Thread**'s window with prefix then % or " starts in that **Thread**'s **Directory**, whichever pane I split from

### Sessions

- A **Thread** has at most one **Session**; a **Thread** with no **Session** is kept up to date by hand
- A Claude session becomes a **Session** only when it is started from **Home**, or by another **Session** when I tell it to, either fresh or by adopting an existing Claude session; one started anywhere else has no **Thread** and is ignored
- A **Session** can create **Threads** anywhere in the tree. Creating a **Thread** never starts a **Session** for it; the work it is for is written into its **Notes**, with its **Summary** and **Next step** drawn from them
- A **Session** starts another **Thread**'s **Session** only when I clearly tell it to start it or send it a prompt now. It starts in the background, so I stay where I am, and getting there is still through **Home**. When it is unclear whether I meant to start it, the **Session** creates the **Thread** and asks me
- A **Session** acts for me: it can do anything I can do, but on anything other than its own **Thread** it acts only when I tell it to. If it notices something elsewhere, it tells me rather than acting
- The one thing a **Session** cannot do that I can is write my **Thoughts**. It learns about other **Threads** from their **Summary**, **Next step** and **Notes**, never by reading another **Session**'s conversation
- A **Session** keeps its own **Thread** true by itself, without being told
- When I name a **Thread** loosely, a **Session** acts on it if only one fits, and tells me in a line what it did; if several fit, or none, it asks. It never asks "are you sure", because nothing it does is lost: nothing is deleted, and on another **Thread** it changes only what I asked about, never rewriting the rest
- todos never stops two **Sessions** working in the same **Directory**. A **Session** that finds changes in its **Directory** that are not its own asks me before touching them
- A change a **Session** makes to another **Thread** counts as mine, so that **Thread**'s own **Session** keeps it just as it keeps a change I made by hand
- A change to the **Notes** by me or another **Session** is kept like any change I make by hand. When I write something in the **Summary** that the **Notes** do not say, the **Session** carries it into the **Notes**
- A **Session** can reach every **Thread** and **Session** in todos, not only its own tree, but it reads them only when I ask something that needs them. It is never handed the **Whose move**, **When** or **Ended** of other **Threads** and never brings them up by itself
- Every **Session** runs on the one laptop that runs **Home**. When todos is hosted, the cloud holds only what the **Sessions** report, never the **Sessions** themselves
- A **Session** can send a prompt to the **Session** of any **Thread**. It is typed into the receiving **Session** as my instruction, because the sending **Session** acts for me, with a line saying which **Session** sent it, so its history stays honest and it knows where to reply. It replies only when the prompt asks it to, and a reply never asks for one back. The sending **Session** writes the prompt as a full brief, because the receiving one has not seen its conversation. A prompt is kept in todos until the receiving **Session** can take it: straight away when it is free or busy, and once I have answered when it is asking me something. A prompt to a **Thread** with no running **Session** starts one in the background, the same way going in from **Home** would, and the prompt is its first. So a prompt can be sent from anywhere, and the laptop delivers it
- A **Session** can add **Tasks** to any **Thread** or to none; they land in **Anytime** when linked to a **Thread**, and in the **Inbox** otherwise, unless I tell the **Session** to put them somewhere else

### Projects and areas

- **Projects** and **Areas** stand beside **Threads**: they are not kinds of **Thread**, and a **Thread** is the same whatever it belongs to (ADR 0006)
- A **Thread** at the top of its tree belongs to one **Project**, one **Area** or neither, and the **Threads** under it belong to the same one. Moving a **Thread** under another gives it the **Project** of the tree it lands in; moving it to the top level keeps its **Project**. Taking it out of a **Project** is its own action
- Nothing nests: an **Area** never sits in an **Area**, and a **Project** never sits in a **Project**. The smaller parts of a **Project** are its **Threads**
- A **Project** shows wherever its **Threads** and **Tasks** show; parking it means parking its **Threads**
- Ending a **Project** or dropping an **Area** changes nothing inside it, as ending a **Thread** changes nothing else. The web app asks me first when something inside is still open, and that open work keeps showing under its **Project**, marked **Done**
- A **Project**'s page shows its **Notes**, **Deadline**, **Threads** and **Tasks**; an **Area**'s shows its **Projects**, **Threads** and **Tasks**. An ended **Project** leaves the sidebar
- A **Session** can do everything with **Projects** and **Areas** that I can, acting outside its own **Thread** only when I tell it to

### Tasks

- An open **Task** is in exactly one of **Inbox**, **Today**, **Anytime**, **Upcoming** or **Someday**, and every place that shows the lists shows them in that order
- A **Task** can be linked to at most one **Thread**, **Project** or **Area**, and each of them can have many **Tasks** linked to it. Being linked changes nothing else about how it behaves, beyond moving a **Task** out of the **Inbox** as the **Inbox** says; it appears in the same lists, grouped under the **Project** or **Area** it belongs to and then under its **Thread**'s title, except in **Upcoming**, which groups under the day and then the **Thread**'s title
- A **Thread** has exactly one **Next step**, which never appears among the **Tasks** to pick from; if it should, a **Task** is added to the **Thread** by hand
- A **Task** in any list can be turned into a new **Thread**: the **Thread** takes its title, **Notes**, **Deadline** and **When** (a **Someday** **Task** gives a **Someday** **Thread**, a **Task** in **Upcoming** a **Thread** that comes back on its **Date**, any other an **Active** one, as a **Task** in **Today** is), its checklist steps become **Tasks** linked to the **Thread**, and the **Task** itself is gone, the one way a **Task** leaves without being **Done** or **Dropped**, because everything in it now lives in the **Thread**
- Full work with **Tasks**, such as setting a **Date** or **Deadline**, moving between lists, dropping, linking to a **Thread** and turning one into a **Thread**, happens in the web app. The task panel in the terminal stays light, so the terminal never gets a second **Home**

### The Threads page

- The web app's sidebar has one entry for the **Threads page**, below the lists, and names no **Threads**. Below a divider it lists the open **Projects** in no **Area**, then each **Area** in bold with its open **Projects** level beneath it, each **Project** showing its **Deadline**; each opens a page of its own
- It shows what **Home** shows and uses **Home**'s keys, each meaning the same. Enter opens a **Thread** on its own page, the nearest thing to going into it, because the web app never runs a **Session**
- A **Thread**'s details show its title, **Whose move**, **When**, **Summary**, **Next step** and folded **Notes**, then its open linked **Tasks**, which can be ticked off there as in any list
- Everything about a **Thread** can be changed there, as on **Home**: its fields, its **Whose move**, **When** and **Ended**, adding child **Threads**, reordering and moving
- A **Thread** can open on a page of its own, showing its details, its child **Threads** and its **Tasks**. On the phone every **Thread** is shown this way, one at a time
- Linking a **Task**, placing a new **Thread** and moving a **Thread** all use the same picker of open **Threads**, shown as the tree until I type
- A **Task** added from a **Thread**'s details is linked to it and goes to **Anytime** unless I pick otherwise, because it is already clarified
- In a list, clicking a **Thread**'s title over its group opens it on the **Threads page**
- In the web app, **Someday** shows each **Someday** **Thread** as its title over a group, even with no **Tasks** under it, and **Upcoming** does the same for a **Thread** under the day it comes back. The count beside a list counts only **Tasks**. The terminal task panel shows only **Tasks** and the titles of their **Threads**, because inside a **Thread** nothing shows the state of other **Threads**
- A **Summary**, a **Thread**'s **Notes** and a **Task**'s **Notes** are written in Markdown and shown formatted

### Thoughts

- There is one **Thoughts**, the same on **Home** and in every **Thread**; it belongs to no **Thread**
- **Thoughts** is one page of free text that only I write; a **Session** reads it only when I ask it to, and is never handed it

## Example dialogue

> **Dev:** "When I **Capture** 'look into flaky login test', is that a **Thread**?"
> **Domain expert:** "No, everything captured is a **Task** in the **Inbox**. When I **Clarify** it I might turn it into a **Thread** if it turns out to be a real piece of work."

> **Dev:** "The MCP server **Thread** is **Waiting** on CI, and I ask its **Session** to fix a typo. What does **Home** show afterwards?"
> **Domain expert:** "**Working** while it fixes the typo. When it finishes its turn it has to set its **Whose move**, and it is still waiting on CI, so it goes back to **Waiting**, not **On me**."

## Flagged ambiguities

- "needs me" and "asking" were used as separate ideas from **On me**: resolved as the same thing. If a **Session** is asking me something, its **Thread** is **On me**. The app watches each **Session** to work out the **Thread**'s **Whose move**, but the **Session**'s own states are not part of the language.
- "done when" was suggested as a separate field: resolved as not needed. A **Thread**'s title says what the outcome is.
- "parent thread" was used as if it were a different kind of thing: resolved as no separate concept. A **Thread** that has children is just a **Thread**.
- "project" was used for a big piece of work: resolved as **Thread**. A **Thread** is not a Claude session, though it can have one. todos has no Projects: the **Tasks** that are part of an outcome are linked to its **Thread**, whether or not it ever has a **Session**.
