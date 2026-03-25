# Deep Analysis Research

## Scope And Method

This document captures the current runtime behavior of the chess coach application so the backend and frontend can be refactored from an accurate baseline.

Primary runtime sources of truth:

- `server.py`
- `sessions.py`
- `board_state.py`
- `engine.py`
- `heuristics.py`
- `coach.py`
- `frontend/src/App.tsx`
- `frontend/src/types.ts`
- `frontend/src/api.ts`
- `frontend/src/organisms/AnalysisLayout.tsx`
- `frontend/src/organisms/BoardPanel.tsx`
- `frontend/src/organisms/CoachPanel.tsx`
- `frontend/src/organisms/PgnNavigator.tsx`

Secondary sources used only as historical intent or drift detectors:

- `ui_spec.md`
- `README.md`
- `# Frontend Architecture.md`
- `frontend/e2e/frontend.spec.ts`
- `frontend/e2e/fixtures.ts`
- `main.py`

Explicitly ignored:

- Linear ticket files
- `plan_linear*` files

The two key principles in this document are:

1. Runtime code beats docs and tests when they disagree.
2. Refactor pressure usually comes from hidden coupling, not from any one component in isolation.

## System Snapshot

The app is a session-backed chess analysis tool with a React/Vite frontend and a FastAPI backend.

High-level shape:

- The frontend sends validated chess input (`fen` or `pgn`) to the backend.
- The backend creates or reuses an in-memory session.
- Each session owns a live `BoardState`, a live `Coach`, and a live Stockfish engine process.
- The frontend analysis screen is orchestrated by `frontend/src/App.tsx`.
- The left panel renders the board and owns move execution.
- The right panel is currently chat-only, but the requested refactor wants it to become a richer Coach/Moves rail with shared board-aware controls.

## Architecture Diagram

```mermaid
flowchart LR
    InputView[InputView] --> ValidateApi[/api/validate]
    ValidateApi --> AppState[App reducer state]
    AppState --> AnalyzeApi[/api/analyze]
    AnalyzeApi --> SessionStore[In-memory sessions]
    SessionStore --> BoardState[BoardState]
    SessionStore --> Engine[EngineAnalysis]
    SessionStore --> Coach[Coach]
    AnalyzeApi --> AppState
    AppState --> BoardPanel[BoardPanel]
    AppState --> CoachPanel[CoachPanel]
    BoardPanel --> MoveApi[/api/move SSE]
    BoardPanel --> OpponentApi[/api/opponent-move]
    CoachPanel --> ChatApi[/api/chat]
    CoachPanel --> PgnApi[/api/pgn/navigate]
    MoveApi --> AppState
    OpponentApi --> AppState
    ChatApi --> AppState
    PgnApi --> AppState
```



## Backend Runtime Architecture

### `server.py` Is The Real HTTP Contract

`server.py` is the actual backend contract. It defines:

- request models
- the response envelope
- session creation rules
- endpoint orchestration
- [SSE event sequencing for]() `/api/move`

The backend is not a thin stateless engine wrapper. It is sessionful and stateful.

### Session Model In `sessions.py`

Each session stores:

- `coach`
- `board_state`
- `engine`
- `created_at`
- `last_active`

Important properties:

- Sessions are in-memory only.
- Session TTL is 30 minutes.
- Cleanup runs every 5 minutes.
- Each new session starts its own Stockfish process via `EngineAnalysis.start()`.
- All successful session reads refresh `last_active`.

This means the backend is optimized around a stateful conversation and analysis session, not around stateless chess requests.

### Board Model In `board_state.py`

`BoardState` is the authoritative board/session state machine. It owns:

- the live `python-chess` `Board` instance
- `initial_fen`
- `move_history`
- `pgn_game`
- `pgn_moves`
- `pgn_current_index`
- `pgn_mode`

The important mental model is:

- `board` is the current position object
- `move_history` is a SAN display/history list
- `pgn_mode` means the session is navigating a loaded PGN mainline
- `pgn_current_index` is a half-move cursor

### Engine Layer In `engine.py`

`EngineAnalysis` is the deterministic analysis layer.

Key behaviors:

- `analyze_position(board, num_moves=3)` runs Stockfish `analyse(..., multipv=num_moves)`
- it returns top moves with `san`, `score_cp`, `mate`, and `pv`
- `score_cp` is always computed from `score.white()`, so it is White-centric
- `get_opponent_move(board, elo)` configures Stockfish strength and returns `{ san, uci, from, to }`

Important caveat:

- frontend and coaching logic must remember that scores are not normalized to "side to move"

### Heuristics Layer In `heuristics.py`

`extract_heuristics(board)` computes:

- material
- center control
- piece activity
- king safety
- pawn structure
- tactics
- development

These heuristics serve two roles:

- raw data returned to the frontend from `/api/analyze`
- a formatted string fed into the LLM prompt

Important caveats:

- the heuristics are intentionally approximate
- `king_safety.castled` actually means "castling rights lost", not strictly "the king castled"
- tactical motif detection is simple and not a full tactical search

### Coach Layer In `coach.py`

`Coach` owns per-session LLM conversation state.

Key methods:

- `analyze_position(...)`
- `compare_moves(...)`
- `compare_moves_stream(...)`
- `followup(question)`

Important properties:

- `conversation_history` is reused across analysis, move coaching, and free-form chat
- `MAX_HISTORY = 20`
- history pruning preserves the first user/assistant pair and trims later context

Important caveat:

- many Anthropic failures are converted into fallback strings and returned as successful content instead of propagating as structured API failures

## `/api/analyze` Deep Trace

### Purpose

`/api/analyze` is currently not a pure "analyze current position" endpoint.

It does all of the following:

- creates or reuses a session
- loads a position into the session board state
- runs engine analysis
- extracts heuristics
- generates the initial coach response
- returns optional PGN navigator state

In other words, it is both a session-initialization endpoint and an analysis endpoint.

### Request Shape

In `server.py`, the request model is:

- `fen: str`
- `session_id: str | None = None`
- `pgn: str | None = None`

Hidden mismatch:

- `fen` is required by the Pydantic model even though the handler ignores it when `pgn` is present
- the frontend works around this by always sending a validated `fen` and optionally a `pgn`

### Execution Path

The live control flow is:

1. create `request_id`
2. call `get_or_create_session(req.session_id)`
3. pull `board_state`, `engine`, and `coach` from session
4. if `req.pgn` exists:
  - call `BoardState.load_pgn(req.pgn)`
  - if load fails, return `INVALID_PGN`
5. else:
  - call `BoardState.load_fen(req.fen)`
  - if load fails, return `INVALID_FEN`
6. call `engine.analyze_position(bs.board, num_moves=3)`
7. call `extract_heuristics(bs.board)`
8. format top moves and heuristics into prompt strings
9. call `coach.analyze_position(...)`
10. if in PGN mode, build `pgn_nav`
11. return JSON envelope with session data, position, engine data, heuristics, coach text, and optional `pgn_nav`

### Essential Coupling Snippet

File: `server.py`

```python
@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, request: Request):
    request_id = str(uuid.uuid4())
    session_id, session = get_or_create_session(req.session_id)
    bs = session["board_state"]
    engine = session["engine"]
    coach = session["coach"]

    if req.pgn:
        success, message = bs.load_pgn(req.pgn)
        if not success:
            return err_response("INVALID_PGN", message, request_id)
    else:
        try:
            bs.load_fen(req.fen)
        except Exception as e:
            return err_response("INVALID_FEN", str(e), request_id)

    top_moves = engine.analyze_position(bs.board, num_moves=3)
    heuristics = extract_heuristics(bs.board)
    coach_response = coach.analyze_position(...)
```

### Response Shape

`/api/analyze` returns:

- `session_id`
- `fen`
- `turn`
- `top_moves`
- `heuristics`
- `coach_response`
- `pgn_nav` or `null`

Important details:

- `top_moves` are sanitized through `serialize_moves()` to strip raw `chess.Move` objects
- `pgn_nav.total_moves` is actually the number of half-moves, because it is `len(bs.pgn_moves)`

### Runtime Invariants

`/api/analyze` currently assumes:

- analysis is tied to a mutable session
- engine, board, and coach are all session-scoped
- a new analyze call can reuse old conversation history if the caller passes an existing `session_id`
- board load happens before engine/heuristics/coach work

### Hidden Coupling And Risks

#### 1. Analysis Reuses Coach History

If the frontend reuses `session_id`, `/api/analyze` loads a new position but still keeps the old `Coach.conversation_history`.

Implication:

- a new position can inherit prior conversational context unless the caller deliberately creates a new session

#### 2. `load_fen()` Exits PGN Mode

This is the most important coupling for PGN navigation.

File: `board_state.py`

```python
def load_fen(self, fen: str):
    self.exit_pgn_mode()
    self.board = chess.Board(fen)
    self.initial_fen = fen
    self.move_history = []
```

Implication:

- if the frontend tries to "reanalyze the currently navigated PGN position" by calling `/api/analyze` with a FEN, PGN mode will be destroyed

#### 3. The Endpoint Is Overloaded

`/api/analyze` currently mixes:

- session lifecycle
- board load
- engine analysis
- heuristics extraction
- coach prompt generation

Implication:

- refactoring UI behavior often forces backend contract changes because analysis and initialization are not separated

## Other Backend Endpoints Compared To `/api/analyze`

### Endpoint Comparison Matrix


| Endpoint             | Creates Session | Reads Session Board                   | Trusts Client FEN | Mutates Session Board | Returns Engine Data | Returns Coach Data |
| -------------------- | --------------- | ------------------------------------- | ----------------- | --------------------- | ------------------- | ------------------ |
| `/api/validate`      | No              | No                                    | Yes               | No                    | No                  | No                 |
| `/api/analyze`       | Yes             | Yes                                   | Yes, on FEN path  | Yes                   | Yes                 | Yes                |
| `/api/move`          | No              | Yes, but resets from client FEN first | Yes               | Yes                   | Yes                 | Yes, via SSE       |
| `/api/chat`          | No              | No                                    | Yes               | No                    | No                  | Yes                |
| `/api/pgn/navigate`  | No              | Yes                                   | No                | Yes                   | No                  | No                 |
| `/api/opponent-move` | No              | Yes, but resets from client FEN first | Yes               | Yes                   | Yes                 | No                 |


This table exposes the biggest contract problem in the backend:

- authority over the current position is split between session board state and client-supplied FEN depending on endpoint

### `/api/validate`

Purpose:

- validate input without engine or LLM work

Behavior:

- if `pgn` is provided, parse PGN into a temporary `BoardState`
- else load FEN into a temporary `BoardState`
- return normalized `fen`, `turn`, `legal_moves`, and optional `pgn_metadata`

Important:

- `/api/validate` does not create or mutate a session

### `/api/move`

Purpose:

- evaluate and play a user move, then stream coach feedback

Behavior:

- expects existing `session_id`
- rebuilds `bs.board` from client-supplied `fen`
- validates `move`
- analyzes current position for best moves
- analyzes resulting board for user move score
- pushes move into session board state
- emits SSE events:
  - `move_data`
  - `coach_skip` or `coach_stream`
  - `done`

Important caveats:

- it mutates the session board after first resetting the board from client FEN
- it passes `fen=req.fen` into the coach prompt but uses `turn=bs.turn` after the move is pushed, so prompt context can be semantically inconsistent
- it does not return updated PGN navigation state

### `/api/chat`

Purpose:

- free-form follow-up questions

Behavior:

- expects existing `session_id`
- enriches the user question with a fresh `chess.Board(req.fen)`
- extracts heuristics from client-supplied FEN
- sends enriched message into session `Coach.followup(...)`

Important caveat:

- it does not use session board state at all
- chat context is therefore partly session-based and partly client-FEN-based

### `/api/pgn/navigate`

Purpose:

- move the PGN cursor inside a loaded PGN session

Behavior:

- expects existing `session_id`
- requires `bs.pgn_mode`
- calls one of:
  - `navigate_to_move`
  - `pgn_next`
  - `pgn_prev`
  - `pgn_start`
  - `pgn_end`
- returns:
  - `fen`
  - `turn`
  - `move_index`
  - `total_moves`
  - `last_move_san`
  - `move_display`
  - `legal_moves`

Important caveat:

- it returns no fresh engine analysis and no fresh heuristics

### `/api/opponent-move`

Purpose:

- let Stockfish play as the computer opponent

Behavior:

- expects existing `session_id`
- resets `bs.board` from client FEN
- gets move from engine at requested ELO
- pushes move into session board state
- re-analyzes resulting board and returns `top_moves`

Important caveat:

- it does not use `from` and `to` for any frontend highlight behavior today

## Board State Lifecycle

### `BoardState.load_fen()`

Effects:

- exits PGN mode
- replaces current board
- resets `initial_fen`
- clears `move_history`

Meaning:

- FEN load is treated as a fresh session position, not as a simple board snapshot update

### `BoardState.load_pgn()`

Effects:

- parses only the PGN mainline
- populates `pgn_moves`
- sets `pgn_current_index = 0`
- sets `pgn_mode = True`
- resets board to starting FEN
- resets `move_history`

Meaning:

- a PGN-loaded session starts at move 0, not at the final position

### `BoardState.push_move()`

This method has two modes:

- if in PGN mode and the move matches the expected next PGN move, stay in PGN mode and advance the cursor
- otherwise exit PGN mode and continue as live play

This is a strong and useful invariant, but the frontend currently does not receive enough state back to reflect it correctly after `/api/move`.

### `BoardState.navigate_to_move()`

This method:

- rebuilds the board from `initial_fen`
- replays moves up to the requested half-move index
- rebuilds `move_history`
- updates `pgn_current_index`

Meaning:

- PGN navigation is deterministic and server-authoritative

### Hidden String Protocol: `move_display`

`BoardState.get_pgn_moves_display()` returns a string with `*` inserted at the current position.

The frontend parses this via `split('*')` in `PgnNavigator`.

Implication:

- PGN navigation state is not represented as structured move objects on the frontend
- there is a hidden string protocol between backend and frontend

## Frontend Runtime Architecture

### `App.tsx` Is The Analysis Screen Orchestrator

`frontend/src/App.tsx` owns:

- the app-level view state machine
- the analysis data
- the shared props passed into `BoardPanel` and `CoachPanel`

Views:

- `input`
- `loading`
- `color_select`
- `analysis`

This is already a reducer-based coordination layer, not a lightweight shell.

### Shared Analysis State In `types.ts`

`AnalysisViewState` currently contains:

- `sessionId`
- `currentFen`
- `initialFen`
- `turn`
- `playerColor`
- `moveHistory`
- `topMoves`
- `heuristics`
- `chatMessages`
- `isCoachThinking`
- `pgn`
- `opponentElo`

Important mismatch:

- some of these fields are central to runtime behavior
- some are stored but effectively unused in the current UI

### Current State Ownership

#### Shared State In `App.tsx`

Shared analysis state lives in `App.tsx`.

That includes:

- `currentFen`
- `turn`
- `topMoves`
- `chatMessages`
- `isCoachThinking`
- `pgn`

#### Local State In `CoachPanel.tsx`

`CoachPanel` currently owns only local chat UI state:

- composer input text
- autoscroll
- "new message" pill behavior

It does not own shared analysis state and does not know about:

- `topMoves`
- `pgn`
- board hint visibility
- move navigation state

#### Local State In `BoardPanel.tsx`

`BoardPanel` owns:

- board width
- waiting-for-opponent state
- dormant `flashSquare`
- a few helper refs

It consumes shared board state from `App`.

## Frontend Layout And Component Roles

### `AnalysisLayout.tsx`

`AnalysisLayout` is a two-slot grid shell.

It is intentionally simple:

- left slot for `BoardPanel`
- right slot for `CoachPanel`

Important implication:

- `BoardPanel` and `CoachPanel` are siblings
- any shared coordination between them must pass through `App.tsx` or a future shared context/store

### `BoardPanel.tsx`

`BoardPanel` currently mixes rendering and controller logic.

It is responsible for:

- rendering `react-chessboard`
- validating piece drops locally with `chess.js`
- optimistic board updates
- consuming `/api/move` SSE
- triggering optional opponent moves
- deriving a best-line arrow via `getPvArrows()`

Important current behavior:

- `getPvArrows()` uses only `topMoves[0].pv[0]`
- the board therefore shows only the first move of the best PV, not the whole line

### `CoachPanel.tsx`

`CoachPanel` is currently chat-only.

It renders:

- header with `Coach` label and `New Game`
- chat history
- thinking indicator
- unread/new-message pill
- bottom composer

It posts to `/api/chat` and depends on:

- `sessionId`
- `currentFen`
- `messages`
- `isThinking`
- callbacks for new messages and thinking state

### `PgnNavigator.tsx`

`PgnNavigator` is implemented but not currently mounted in the live board screen.

It provides:

- start
- previous
- next
- end
- move counter
- move display string

Important limitation:

- it depends entirely on `PgnNav { move_index, total_moves, move_display }`
- it does not own a structured move list

## Frontend Data Flow

### Initial Submit Flow

Flow in `App.handleSubmit()`:

1. create `AbortController`
2. dispatch `SUBMIT`
3. call `/api/validate`
4. determine `playerColor`
  - if PGN: infer from validated turn
  - if FEN: show `ColorSelectModal`
5. call `/api/analyze`
6. seed `AnalysisViewState`
7. render `AnalysisLayout`

Important implication:

- FEN flow and PGN flow are not symmetrical
- FEN flow includes an extra modal state not described in some older docs/tests

### User Move Flow

Flow in `BoardPanel.handlePieceDrop()`:

1. use local `chess.js` with `currentFen`
2. validate and optimistically update board
3. set coach thinking true
4. call `apiStreamMove('/api/move', ...)`
5. on `move_data`
  - update `topMoves`
  - cache `fen_after`
6. on `coach_stream`
  - stream tokens into the latest coach message
7. on `coach_skip`
  - append `Good move!`
8. on `done`
  - finalize stream
  - clear thinking
  - optionally trigger opponent move
9. on error
  - revert FEN
  - append system error

Important caveats:

- `/api/move` is fired without `await`
- the UI assumes at most one active streaming coach response
- move history and PGN state are not refreshed on move success

### Chat Flow

Flow in `CoachPanel.handleSend()`:

1. trim input
2. append user message locally through callback
3. set thinking true
4. call `/api/chat` with `session_id`, `message`, and current `fen`
5. append coach response or system error
6. clear thinking

Important implication:

- chat always follows the current frontend `currentFen`, even after PGN navigation

### PGN Navigation Flow

Flow in `PgnNavigator.navigate()`:

1. call `/api/pgn/navigate`
2. receive `fen`, `turn`, and `pgn` navigation fields
3. call `onNavigate(...)`
4. `App` updates `pgn`
5. `App` updates `currentFen` and `turn`

Important caveat:

- engine analysis and heuristics are not refreshed
- if `PgnNavigator` were visible, the board position would change but best-line hints and engine lines would be stale

### Opponent Move Flow

If `opponentElo` is enabled:

1. `BoardPanel` waits 1.5 seconds
2. calls `/api/opponent-move`
3. updates `currentFen`
4. updates `turn`
5. updates `topMoves`
6. appends system message

Important caveats:

- there is no initial automatic opponent move if the user chooses the side that is not to move
- `turn` is not used to enforce side ownership in the board UI

## Current UI Affordances And Dormant Code

### Working Today

- chat panel
- new game reset
- board rendering
- drag/drop move play
- best-line arrow from `topMoves`
- computer-opponent mode

### Present But Dormant Or Commented Out

- `EvalBar`
- `MoveCard`
- `PgnNavigator`
- `flashSquare`
- `prevFenRef`

This is important: the current codebase already has partial primitives for the requested redesign, but they are not fully wired into the live UI.

### Board Hinting Today

The board already has two relevant rendering hooks:

- `customArrows={pvArrows}`
- `customSquareStyles={customSquareStyles}`

But only the arrow path is actively used.

`flashSquare` exists but is never set, so square highlighting is effectively dead code.

### Unused Or Partially Used Frontend State

In the current frontend:

- `moveHistory` is initialized but never updated or rendered
- `heuristics` is stored but never displayed
- `initialFen` is stored but unused
- `SET_ABORT` exists in `AppAction` but is not handled by the reducer
- loading step `"coach"` exists but is never dispatched

These are likely remnants of a broader intended design that the current screen never fully implemented.

## Right-Rail Refactor Implications From The Requested UI

The requested redesign adds:

- tabs: `Coach` and `Moves`
- toolbar 1: start, previous, next, end
- toolbar 2: lightbulb and question mark
- chat composer moved to the top
- conversation below the composer
- `Moves` tab with move navigation
- hint buttons that affect board rendering

### Why Shared State Belongs In `App.tsx`

The key architectural point from the earlier design discussion is:

- the controls live in the right rail
- the effects render on the board

That means the control state is shared across sibling components.

`App.tsx` is therefore the natural place for:

- best-line visibility toggle
- best-move source-square highlight toggle
- any shared navigation/loading state
- possibly the active moves surface state if multiple panels need to react to it

By contrast, `CoachPanel` can keep truly local UI state such as:

- text input contents
- autoscroll
- maybe the active tab, if nothing outside the right rail cares about it

### Why The `Moves` Tab Is Broader Than PGN

The original plan assumption was:

- "Moves tab shows the existing `PgnNavigator`"

But the clarified product requirement is broader:

- the Moves tab should also work when starting from a FEN
- it should keep updating as the player makes moves

That means the future Moves surface is not just a PGN navigator. It is closer to a unified move-history/move-navigation UI.

Current blockers:

- the frontend has no live move-history model
- the backend has `move_history`, but it is not surfaced end to end
- `PgnNav` is PGN-specific and string-based

## Runtime Vs Docs And Tests

### `ui_spec.md`

Useful as design intent, but stale in important ways:

- describes `/api/move` as a normal JSON response, while runtime uses SSE
- does not account for `ColorSelectModal` in FEN flow
- describes board widgets as visible, but they are commented out in runtime
- describes request tracing and some errors more cleanly than runtime actually implements

### `README.md`

Helpful for conceptual architecture and CLI heritage, but not authoritative for web runtime.

It is especially useful for understanding:

- the original three-layer mental model
- PGN navigation semantics

But it does not reflect:

- frontend session orchestration
- SSE move flow
- color selection modal

### `# Frontend Architecture.md`

Useful as a component map, but stale in one important way:

- it shows `EvalBar`, `MoveCard`, and `PgnNavigator` as active children of `BoardPanel`, even though those render paths are commented out right now

### Playwright Tests And Fixtures

`frontend/e2e/frontend.spec.ts` and `frontend/e2e/fixtures.ts` are significantly out of sync with runtime.

Examples:

- tests expect `eval-bar` and engine lines to be visible
- tests expect `pgn-navigator` to be visible
- tests do not account for color-selection modal in FEN flow
- fixtures mock `/api/move` as a normal JSON response, but the real frontend consumes SSE

Implication:

- current end-to-end tests are not reliable coverage for the real interactive move flow

## Concrete Drift Inventory

### Backend Contract Drift

1. `/api/analyze` request model requires `fen` even when `pgn` is present.
2. `/api/move` runtime is SSE, but older docs/tests describe plain JSON.
3. `/api/chat` uses client FEN instead of session board state.
4. request tracing is inconsistent:
  - `request_id` exists in JSON
  - `X-Request-Id` header is set on error responses, not uniformly on success responses

### Frontend Runtime Drift

1. `BoardPanel` imports and conceptually supports eval bar, move cards, and PGN navigator, but does not render them.
2. `flashSquare` exists but is not active.
3. `moveHistory` exists in state but has no pipeline.
4. `heuristics` exists in state but has no visible UI.
5. `ColorSelectModal` changes the state machine beyond what some docs/tests describe.

### Product/Architecture Drift

1. Current frontend is chat-first; requested UI wants a tabbed right rail.
2. Current moves concept is PGN-specific; requested UI needs moves for both PGN and FEN-started sessions.
3. Current best-line display is always board-side and implicit; requested UI wants user-controlled hint toolbars.

## Refactor Constraints And Recommended Seams

### 1. Choose Position Authority

The biggest backend design decision is:

- is the session board authoritative, or is client-supplied FEN authoritative?

Right now the answer is "both, depending on endpoint", which is the main source of hidden coupling.

### 2. Separate Session Init From Position Analysis

`/api/analyze` should likely be split conceptually into:

- load/init session state
- analyze current position

That does not necessarily require two public endpoints immediately, but it should at least become two distinct responsibilities in code.

### 3. Preserve PGN Mode During Reanalysis

If the product wants fresh hints while navigating PGN:

- do not reuse the FEN load path in `load_fen()`
- either extend `/api/pgn/navigate` to return fresh analysis
- or add a "analyze current session position" path that does not reset PGN mode

### 4. Make Frontend State Position-Centric

Today `currentFen`, `topMoves`, `heuristics`, and `pgn` can drift out of sync.

A cleaner future model would attach analysis data to the currently displayed position so these values move together.

### 5. Define A Real Moves Model

For the requested `Moves` tab, decide what the source of truth is:

- backend `move_history`
- PGN cursor state
- local client history
- or a unified position-history model

Without this, the moves tab will become ad hoc quickly.

### 6. Keep Shared Right-Rail Controls Above Sibling Panels

Because `BoardPanel` and `CoachPanel` are siblings, board-affecting control state should live above them, likely in `App.tsx`.

That includes:

- show best line
- show best move source square
- any shared navigation activity state

### 7. Normalize Testing Around Reality

Before or during refactor:

- update fixtures to reflect SSE move flow or replace with a realistic abstraction layer
- update tests for color selection and actual visible widgets
- do not rely on `ui_spec.md` or stale tests as if they already match runtime

## Suggested Refactor Targets

### Backend

- Extract "load position into session" from "analyze current session position"
- Make endpoint authority consistent
- Decide how coach history should behave when reanalyzing a new position in the same session
- Return richer move/navigation state if the Moves tab needs it
- Consider structured move-list responses instead of `move_display` strings

### Frontend

- Keep `App.tsx` as the shared analysis coordinator
- Refactor `CoachPanel` into a tabbed right rail
- Keep board rendering inside `BoardPanel`
- Pass board-affecting hint/navigation state down from `App`
- Replace dormant `flashSquare` with explicit highlight behavior
- Introduce a real move-history model for a Moves tab that works for both PGN and FEN-started sessions

## Practical Bottom Line

The most important truths to carry into the refactor are:

1. `/api/analyze` is currently an orchestration endpoint, not a pure analysis endpoint.
2. PGN mode is a real backend state machine, and `load_fen()` destroys it.
3. The frontend already has a good shared-state seam in `App.tsx`.
4. `BoardPanel` and `CoachPanel` are siblings, so shared right-rail controls should not live only inside `CoachPanel`.
5. The current "moves" model is too weak for the requested Coach/Moves redesign.
6. Docs and tests are useful context, but they do not accurately describe the live runtime in several critical places.

Any successful FE/BE refactor should start by aligning around those six facts.