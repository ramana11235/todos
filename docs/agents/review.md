# Reviews and audits

A review checks one change before it ships: everything changed for its issue, however small. An audit runs the same checks over the whole repo, after each big piece of work is done and whenever I ask. Neither changes any code. Each produces a report, and every finding in it becomes an issue.

An agent with the ponytail plugin can run `/ponytail-review` or `/ponytail-audit`, which follow these checks. Without it, follow this file. If the two ever disagree, this file is the one that counts.

## Understand first

- Read the change, then the code it touches: the callers of every changed function, the functions it calls, and their tests.
- Follow the data: where it comes in, what is stored, what goes out.
- When a signature, return value or behaviour changes, search for every caller, because a change can break code it does not touch.
- Judge load against what todos really has: one person, a few Sessions and hooks at once, and the hosted Instance on Cloudflare's free plan (100,000 Worker requests and 5 million D1 rows read a day). Both the hosted and the local Instance must hold.

## What to look for, most important first

1. **Correct.** A wrong result, a crash, a missed edge case (empty, zero, the last item, time zones), or a caller the change breaks.
2. **Safe.** Security holes, such as a missing check on input from outside, a secret that is logged or sent somewhere, or a way past Cloudflare Access. Data loss, such as a swallowed error, writes in the wrong order, or one write overwriting another.
3. **Holds at the expected load.** Work that is fine once but wrong when Sessions and hooks run at the same time, such as reading a row and writing it back whole, and anything that uses up the free plan, such as polling nobody is looking at.
4. **Risky logic is tested.** A branch, a parser, security, data writes or a bug fix needs one test that fails when it breaks.
5. **Fast enough.** Big slowdowns only.
6. **Moves as agreed.** A change to how the TUI or the web app looks or feels moves as `docs/animation.md` says. An action it adds or changes that the file does not cover yet is a finding.
7. **No needless code.** Dead code, options nobody sets, layers with one use, near-copies that must change together, something the repo or the platform already does, and functions that do several unrelated jobs.

## Before reporting a finding

- Every finding needs a concrete case: this input or situation leads to this wrong result. No case, no finding.
- Re-read the lines and confirm the case is real: the caller exists, the value can really be empty.
- A `shortcut:` comment that names its limit is a decision, not a finding, unless todos already crosses that limit.
- Propose the smallest fix that works, preferring one that deletes code.

## The report

Write in plain words for someone who has never seen the code. Start with what the change does, in two or three sentences. Then number the findings across three groups:

- **Must fix:** a bug, a security hole, data loss, or something that breaks at the expected load. Must-fixes are fixed before the change ships.
- **Should fix:** risky code without a test, real slowness, near-copies, a function that mixes jobs, code that should not exist.
- **Nice to have:** small speed-ups and shorter forms.

Each finding says where it is (file and lines), what the code is for, the problem with its concrete case, the fix, and what happens if it is skipped. End with whether the change can ship, and anything that mattered but could not be checked.
