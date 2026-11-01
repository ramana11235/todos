# The terminal app is Ink inside its own tmux server

Home is an Ink app, and each thread's session runs in its own tmux window in that thread's directory, so inside a thread it is plain Claude Code and plain tmux. todos starts tmux on its own server (`tmux -L todos`) with its own config. That config hides the status bar, turns off activity markers and unbinds every key that moves between windows, apart from Alt+h, which goes back to Home. Switching between threads only through Home is the point of the app, and in tools like herdr a visible list of sessions with activity dots makes it too easy to jump straight from one to another. A separate server means a normal tmux setup is not affected.

## Considered options

- Leaving tmux alone and relying on habit. Rejected, because habit is what failed with herdr.
- Restricting the normal tmux setup. Rejected, because it would break tmux use outside todos.
