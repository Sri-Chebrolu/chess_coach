# Prompt refinement
1. The coach prompt needs to be modified so that the coach asks questions first, waits for a response or for the player to move a piece and then gives feedback. If player responds or makes a good/excellent/best move, the coach should say good job and ask the player to explain why they did that.

# Board UX
1. **Board orientation lock** — board flips on every user move; should stay fixed to the user's chosen side. Either add an explicit orientation toggle, or detect player color from PGN header (`[White "..."]` / `[Black "..."]`).
2. **PGN navigation (forward/backward)** — user can only play moves sequentially; needs prev/next controls to step through the historical game without replaying it.
3. **Deviation from game history** — user should be able to make alternative moves at any point in a PGN game to explore sidelines, without being locked to the recorded moves.

# Coach responses
1. **Response length** — coach replies are too long; need a much shorter, punchier style (2-4 sentences max).
2. **Response latency** — coach response arrives ~30s after a move; investigate whether this is streaming, model latency, or Stockfish blocking the event loop. Target: < 5s perceived latency.

# Game engine
1.

# Automated testing
1. Testing for full functionality with simulated games