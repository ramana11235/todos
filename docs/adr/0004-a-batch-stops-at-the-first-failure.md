# A batch stops at the first failure and keeps what came before

A batch of changes runs in order, one change at a time, through the same core methods as the single requests. When a change fails, the batch stops there. The changes before it stay saved, the answer says which worked, which failed and why, and the rest are not tried. A Session that wants to carry on sends the rest again in a new batch.

## Considered options

- All or nothing, where a failure undoes the whole batch. Rejected because every core method reads before it writes, such as a move checking that a Thread is not going under itself, and D1 has no transaction that can stay open across reads and writes. It only runs `db.batch()`, a list of statements written out in advance. All or nothing would need storage to hold back every write, let later reads see the held writes, and commit them together, which is a second write path through all of storage used only by batches, where the local and hosted Instances could quietly differ.
- Carrying on past a failure, as OpenSearch's `_bulk` does. Rejected because changes in a batch often depend on each other, such as moving a Thread and then updating it, so later changes could land on a tree that is not in the shape they expect.

## Consequences

- A failed batch can leave its earlier changes in place. This is the same as a Session making the changes one call at a time and stopping at an error, and nothing in todos is ever deleted, so every change can be put back.
- A batch is capped at 10 changes because the hosted Instance on Cloudflare's free plan allows 50 D1 queries per request. A batch that still runs out of queries partway through a change, such as a move that renumbers many siblings, can leave that one change half written. Nothing is lost, but the order of those siblings may need fixing by hand.
- A batch turns at most 4 Tasks into Threads, and one with more is refused before anything changes. A turn takes about 9 queries even with a long checklist, because its steps are written in one query, so 4 turns leave room for the other changes. Without the cap, a batch of 10 turns would pass the limit partway and could leave a Thread saved while its Task is still there.
