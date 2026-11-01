# Commit messages

Every commit message follows the seven rules from https://cbea.ms/git-commit/, whatever style older commits use. An agent with the write-commit-message skill can use it, which follows the same rules. If the two ever disagree, this file is the one that counts.

1. Separate the subject from the body with a blank line.
2. Keep the subject to 50 characters, 72 at most.
3. Start the subject with a capital letter.
4. Do not end the subject with a full stop.
5. Write the subject in the imperative mood, so it completes "If applied, this commit will ...", as in "Add", "Fix" or "Remove".
6. Wrap the body at 72 characters.
7. Use the body to say what changed and why, not how. The diff already shows how.

Also:

- Write as me, because I am the author. Never say that someone asked for the change, never name me, and never refer to a conversation. Give the reason itself, such as "A whole week on screen makes it hard to focus on one day".
- Never use working terms that mean nothing outside the work, such as "slice 7", "phase 2" or "round 3". Name the thing that changed in plain words.
- Use plain words and no em dashes.
- Commit only your own changes. Several Sessions can work in this repo at once, so ask before including a change that is not yours.
