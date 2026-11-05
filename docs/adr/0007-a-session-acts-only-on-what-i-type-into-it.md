# A Session acts only on what I type into it

todos is for focused work that I direct myself: I go into one Thread on purpose, through Home, and work there. So a Session acts only on what I type into it. No Session can prompt or start another, and nothing written to the API is typed into a Session. This replaces ADR 0003, where a Session could send a prompt to any other, kept in todos and typed in by Home on the laptop.

## Considered options

- Keeping prompts between Sessions, and only letting the laptop send them. Rejected because a Session tricked by something it read, such as a web page or an issue, could still pass the trick on, and the receiving Session reads a typed prompt as my own message, so a Claude permission mode that acts without asking treats it as my instruction.
- Making each prompt wait in Home for my yes. Rejected because it adds a new thing to watch in Home and patches over the problem instead of removing it.

## Consequences

- Something that can write to the hosted API can no longer make the laptop act.
- A coordinating Session cannot hand work to other Sessions, and I cannot move work on from the phone. Work that moves forward without me is to be designed again as a whole, with security as one of its requirements, rather than brought back piece by piece.
