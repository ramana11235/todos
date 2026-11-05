# Prompts between Sessions are kept in todos, not typed straight in

Replaced by `docs/adr/0007-a-session-acts-only-on-what-i-type-into-it.md`: prompts between Sessions were removed.

A prompt sent to a Session is a record in todos, not keystrokes. Whoever sends it, whether another Session, the web app or the phone, writes it to the API for that Thread. The laptop running Home picks it up and types it into the Session's pane when the Session can take it: straight away when it is free or busy, because Claude Code queues typed text during a turn, and only after I have answered when it is asking me something. If the Thread has no running Session, the laptop starts one in the background and the prompt is its first.

## Considered options

- Typing the prompt into the pane with `tmux send-keys` the moment it is sent. Rejected for three reasons. While a Session is asking me something, the keys would answer its menu, so a prompt could approve a command I never saw. Only a Session on the same laptop could send one, so the phone and the web app could not. And a prompt sent while the laptop was asleep would be lost.

## Consequences

- The API holds prompts waiting to be delivered, and the laptop polls for them, as Home already polls for changes.
- A prompt only waits for a short gap, such as a menu or a sleeping laptop. What a Thread should do in the longer run still lives in its Next step.
