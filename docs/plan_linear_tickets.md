# Plan: Create Linear Tickets from Backlog

## Context
The `backlog.md` contains 10 unchecked (`[ ]`) items across 4 categories. Each needs a Linear ticket with acceptance criteria, technical context (mapped to actual source files), and priority assignment. Team: **AI_chess_coach**.

## To-Do List
- [ ] Create ticket: Board UX #3 — Deviation from game history (P2)
- [ ] Create ticket: Board UX #4 — FEN color selection prompt (P2)
- [ ] Create ticket: Board UX #5 — Hide best move behind Hint button (P2)
- [ ] Create ticket: Board UX #6 — Hint button placement (P2)
- [ ] Create ticket: Opponent Play #1 — Computer opponent at specified ELO (P0)
- [ ] Create ticket: Coach Responses #2 — Response latency (P1)
- [ ] Create ticket: Coach Responses #3 — Coach trigger conditions (P1)
- [ ] Create ticket: Bug #1 — "Analysis failed" on rapid moves (P3)
- [ ] Create ticket: Bug #2 — PGN nav buttons not working (P3)
- [ ] Create ticket: Bug #3 — False "sideline" message on PGN move (P3)

---

## Ticket Definitions

### 1. Board UX #3 — Deviation from game history
**Priority:** P2 (Medium)
**Title:** Allow sideline exploration from any PGN position
**Description:** User should be able to make alternative moves at any point in a PGN game to explore sidelines, without being locked to the recorded moves.

**Acceptance Criteria:**
- When in PGN mode, user can make a move that deviates from the recorded game
- Board enters "sideline" mode with clear visual indicator
- User can navigate back to the original PGN line
- Sideline moves are tracked separately from the main PGN line

**Technical Context:**
- `board_state.py` — `BoardState.pgn_mode`, move validation logic in `validate_and_parse_move()`
- `server.py` — `/api/move` endpoint, `/api/pgn/navigate` endpoint
- `frontend/src/organisms/BoardPanel.tsx` — `handlePieceDrop()` (lines 73-124)
- `frontend/src/organisms/PgnNavigator.tsx` — navigation actions and state

---

### 2. Board UX #4 — FEN color selection prompt
**Priority:** P2 (Medium)
**Title:** Prompt user to select color when FEN is provided
**Description:** If a FEN string is provided, the user should be prompted to select white or black. Board populates with the selected color on the user's side.

**Acceptance Criteria:**
- After submitting a FEN, a color selection UI appears (white/black)
- Board orientation matches the user's chosen color
- Selected color persists for the session (no flipping on turn change)

**Technical Context:**
- `frontend/src/organisms/InputPanel.tsx` — FEN submission flow
- `frontend/src/organisms/BoardPanel.tsx` — `boardOrientation` prop (line 145, currently `turn`-based)
- `frontend/src/App.tsx` — state reducer, needs new `SET_ORIENTATION` action
- `frontend/src/types.ts` — add orientation to `AnalysisViewState`

---

### 3. Board UX #5 — Hide best move behind Hint button
**Priority:** P2 (Medium)
**Title:** Hide best move by default; reveal on Hint button click
**Description:** In any given position, the best move should not be shown by default. Only shown when user clicks "Hint".

**Acceptance Criteria:**
- Best move arrow and top-move cards are hidden by default
- A "Hint" button is visible; clicking it reveals the best move
- Hint state resets after each new move

**Technical Context:**
- `frontend/src/organisms/BoardPanel.tsx` — PV arrows logic (lines 35-44), `customArrows` prop (line 152)
- `frontend/src/molecules/MoveCard.tsx` — engine move display cards
- `frontend/src/App.tsx` — state for hint visibility toggle

---

### 4. Board UX #6 — Hint button placement
**Priority:** P2 (Medium)
**Title:** Position Hint button at bottom-right of chessboard
**Description:** The "Hint" button should be located at the bottom right of the chessboard, just one square outside the h1 square on the user's side.

**Acceptance Criteria:**
- Hint button is visually anchored to the right of the h1 corner of the board
- Button position adapts to board orientation (always user's bottom-right)
- Button does not overlap with the board or eval bar

**Technical Context:**
- `frontend/src/organisms/BoardPanel.tsx` — board layout and sizing (ResizeObserver, lines 64-71)
- CSS positioning relative to board container

---

### 5. Opponent Play #1 — Computer opponent at specified ELO
**Priority:** P0 (Urgent)
**Title:** Add computer opponent with configurable ELO for FEN positions
**Description:** If a FEN string is provided, a computer with a user-specified ELO rating should move the opponent's pieces.

**Acceptance Criteria:**
- User can specify an ELO rating when starting a FEN session
- Engine plays opponent moves automatically at approximate ELO strength
- Moves are played with 2 second pause
- User sees the opponent's move animated on the board

**Technical Context:**
- `engine.py` — `EngineAnalysis` class, Stockfish UCI options (`UCI_LimitStrength`, `UCI_Elo`)
- `server.py` — new endpoint or extension of `/api/move` to trigger engine reply
- `board_state.py` — apply engine move to board state
- `frontend/src/organisms/BoardPanel.tsx` — animate opponent move, disable interaction during opponent turn
- `frontend/src/organisms/InputPanel.tsx` — ELO input field
- `frontend/src/App.tsx` — state for opponent mode and ELO

---
### 6. Coach Responses #2 — Response latency
**Priority:** P1 (High)
**Title:** Reduce coach response latency to under 5 seconds
**Description:** Coach response arrives ~30s after a move; investigate whether this is streaming, model latency, or Stockfish blocking the event loop. Target: < 5s perceived latency.

**Acceptance Criteria:**
- Perceived latency from move to first coach text < 5 seconds
- Root cause identified (streaming, model, Stockfish, or combination)
- Implement streaming if not already present

**Technical Context:**
- `coach.py` — `_send()` method, Anthropic API call (blocking, no streaming)
- `server.py` — `/api/move` endpoint calls engine analysis + coach sequentially
- `engine.py` — `analyze_position()` time limit (1.0s default)
- Frontend — no SSE/WebSocket; responses are full JSON after completion

---

### 7. Coach Responses #3 — Coach trigger conditions
**Priority:** P1 (High)
**Title:** Coach only responds on suboptimal moves or user questions
**Description:** The coach should only respond when: (a) the user makes a move that is not the "best" move per Stockfish, or (b) the user asks a question in chat.

**Acceptance Criteria:**
- If user plays the best move, coach does not generate a response (or gives brief affirmation)
- If user plays a suboptimal move, coach provides Socratic feedback
- Chat only questions when move quality is not the "Best Move" per Stockfish
- "Best move" defined as the top engine move (or within a small centipawn threshold)

**Technical Context:**
- `server.py` — `/api/move` endpoint, move comparison logic
- `coach.py` — `compare_moves()` method, conditional call based on delta
- `frontend/src/organisms/BoardPanel.tsx` — `handlePieceDrop()`, conditionally append coach message

---

### 8. Bug #1 — "Analysis failed" on rapid moves
**Priority:** P3 (Low)
**Title:** Fix "Analysis failed" error when moving pieces before coach responds
**Description:** If the user moves white and black pieces before the coach response is output, a system message "Analysis failed. Failed to parse server response." appears.

**Acceptance Criteria:**
- User can make multiple rapid moves without error
- Pending coach requests are cancelled or queued gracefully
- No "Analysis failed" system messages during normal play

**Technical Context:**
- `frontend/src/organisms/BoardPanel.tsx` — `handlePieceDrop()` sends `/api/move` without cancelling prior request
- `frontend/src/api.ts` — fetch wrapper, no AbortController usage
- `server.py` — `/api/move` may receive stale FEN if board advanced
- Likely cause: race condition — second move sends while first `/api/move` is still pending; response for stale position fails to parse

---

### 9. Bug #2 — PGN navigation buttons not working
**Priority:** P3 (Low)
**Title:** Fix "No PGN loaded" error when clicking PGN navigation buttons
**Description:** When a PGN string is provided, clicking Start/Prev/Next/End buttons shows "No PGN loaded in this session."

**Acceptance Criteria:**
- All four navigation buttons work correctly after loading a PGN
- Board updates to correct position on each navigation action
- Move counter updates accurately

**Technical Context:**
- `frontend/src/organisms/PgnNavigator.tsx` — `handleNavigate()` calls `/api/pgn/navigate`
- `server.py` — `/api/pgn/navigate` checks `bs.pgn_mode`; returns `NO_PGN_LOADED` error
- `server.py` — `/api/analyze` may call `load_fen()` instead of `load_pgn()` (known gotcha)
- `board_state.py` — `pgn_mode` flag set only by `load_pgn()`, not `load_fen()`
- Likely cause: session's `board_state` not entering `pgn_mode` because `/api/analyze` uses wrong loader

---

### 10. Bug #3 — False "sideline" message on PGN move
**Priority:** P3 (Low)
**Title:** Fix false "Exited PGN history" message when making moves in PGN mode
**Description:** When a PGN string is provided and user moves a piece, a system message shows "Exited PGN history. You are now exploring a sideline."

**Acceptance Criteria:**
- Moving the next expected PGN move does not trigger the sideline message
- Sideline message only appears when user deviates from recorded moves
- If PGN navigation is broken (Bug #2), fix that first as it may be related

**Technical Context:**
- `board_state.py` — PGN mode exit logic in `validate_and_parse_move()` or move application
- `server.py` — `/api/move` endpoint, sideline detection logic
- `frontend/src/organisms/BoardPanel.tsx` — `handlePieceDrop()` response handling
- Likely related to Bug #2 — if `pgn_mode` isn't set correctly, any move looks like a deviation

---

## Execution Plan

For each ticket above, use the Linear MCP plugin to:
1. Create an issue in team **AI_chess_coach** with the title, description, and acceptance criteria + technical context in the body
2. Set priority: P0 = Urgent, P1 = High, P2 = Medium, P3 = Low
3. Label by category: `board-ux`, `opponent-play`, `coach`, `bug`

## Verification
- After creation, list all Linear issues to confirm 10 tickets exist
- Verify each has correct priority and labels