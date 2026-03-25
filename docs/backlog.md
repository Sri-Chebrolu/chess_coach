# Prompt refinement
- [x] 1. The coach prompt needs to be modified so that the coach asks questions first, waits for a response or for the player to move a piece and then gives feedback. If player responds or makes a good/excellent/best move, the coach should say good job and ask the player to explain why they did that.

# Board UX
- [x] 1. **Board orientation lock** — board flips on every user move; should stay fixed to the user's chosen side. Either add an explicit orientation toggle, or detect player color from PGN header (`[White "..."]` / `[Black "..."]`).
- [x] 2. **PGN navigation (forward/backward)** — user can only play moves sequentially; needs prev/next controls to step through the historical game without replaying it.
- [ ] 3. **Deviation from game history** — user should be able to make alternative moves at any point in a PGN game to explore sidelines, without being locked to the recorded moves.
- [ ] 4. If a FEN string is provided, the user should be prompted to select white or black. Depending on user selection, the board should populate with the selected color on the user's side.
- [ ] 5. In any given position, the best move should not be shown by default. The best move should only be shown if the user clicks a button that says, "Hint".
- [ ] 6. The "Hint" button should be located at the bottom right of the chessboard. Just one square outside the h1 square on the user's side.

# Opponent play
- [x] 1. If a FEN string is provided, a computer with a user-specified ELO rating should move the Opponent's pieces.
- [ ] 2. In FEN mode, after the opponent plays a move, a subsequent user question should take the `/api/chat` position-analysis path. Do not send the prior player move as `fen_before` in this case; trigger the `POSITION_ANALYSIS` flow for the current board instead of move comparison.

# Coach responses
- [x] 1. **Response length** — coach replies are too long; need a much shorter, punchier style (2-4 sentences max).
- [x] 2. **Response latency** — coach response arrives ~30s after a move; investigate whether this is streaming, model latency, or Stockfish blocking the event loop. Target: < 5s perceived latency.
- [x] 3. The coach should only respond when:
    3a. The user makes a move that is not the "best" move as defined by the Stockfish engine
    3b. The user asks a question in the chat box.

# Bugs
- [ ] 1. If the user moves the white and black pieces before the coach response is output in the chatbox, a system message, "Analysis failed. Failed to parse server response. Try again." is shown. Determine the likely reasons this is occurring and fix it.
- [x] 2. If a PGN string is provided, the user should be able to click one move forward, one move backward, to the start of the game, and to the end of the game. Right now, the "Start", "Prev", "Next", "End" buttons are not working. When the buttons are clicked, a system message shows, "No PGN loaded in this session.". Determine the likely reasons this is occurring and fix it.
- [x] 3. If a PGN string is provided and the user moves a piece, a system message shows, "Exited PGN history. You are now exploring a sideline.". Determine the likely reasons this is occurring and fix it.

# Backend Architecture
- [ ] 1. **Decouple Move Execution from AI Analysis** — `/api/move` currently handles board updates, engine analysis, and streams LLM feedback in a single SSE request. This causes UI latency and race conditions if the user moves quickly. Refactor into two endpoints: `/api/move` (fast, deterministic board state + engine eval via standard JSON) and `/api/coach/analyze-move` (slow, streams Socratic feedback via SSE).
- [ ] 2. **Session Persistence & Recovery** — Currently, in-memory sessions expire and kill their Stockfish processes after 30 minutes of inactivity (`TTL_MINUTES = 30` in `sessions.py`). If a user returns after 30 minutes, their session is gone and coaching cannot be resumed. Refactor the session architecture to allow graceful recovery (e.g., store conversation/board state to disk/DB, and spin up a new Stockfish instance lazily if the session is resumed).
