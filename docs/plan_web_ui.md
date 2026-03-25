# Plan: Socratic Chess Coach Web UI

## To-Do List

### Backend
- [x] `coach.py` — add `prune_history()` method and call it in `_send()`
- [x] `sessions.py` — session store, `get_or_create_session()`, `get_session()`, `cleanup_sessions()`
- [x] `server.py` — FastAPI app with all 5 endpoints + lifespan cleanup task
- [x] `requirements.txt` — add `fastapi`, `uvicorn[standard]`

### Frontend Scaffold
- [x] Vite + React TS project at `frontend/` (files written; run `npm install` once Node is installed)
- [x] Install deps: `react-chessboard`, `chess.js`, `tailwindcss`, `postcss`, `autoprefixer`
- [x] `vite.config.ts` — proxy `/api` → `http://localhost:8000`
- [x] `tailwind.config.js` — color tokens, `borderRadius.DEFAULT: '0px'`
- [x] `src/index.css` — CSS variables, font imports, keyframes

### Frontend: Foundation
- [x] `src/types.ts` — all TypeScript interfaces + `AppState` / `AppAction` unions
- [x] `src/api.ts` — `apiFetch<T>` utility + `ApiError` class

### Frontend: Atoms
- [x] `MonoText.tsx`
- [x] `SquareButton.tsx`
- [x] `StatusPill.tsx`
- [x] `EvalBar.tsx`

### Frontend: Molecules
- [x] `FenInput.tsx`
- [x] `PgnInput.tsx`
- [x] `MoveCard.tsx`
- [x] `ChatBubble.tsx`

### Frontend: Organisms
- [x] `InputPanel.tsx`
- [x] `BoardPanel.tsx`
- [x] `CoachPanel.tsx`
- [x] `PgnNavigator.tsx`
- [x] `AnalysisLayout.tsx`

### Frontend: App
- [x] `App.tsx` — `useReducer` state machine + submit flow

### Verification
- [ ] Backend smoke tests (curl `/api/validate`, `/api/analyze`)
- [ ] Frontend happy path (FEN → board + engine lines + chat)
- [ ] PGN navigation test
- [ ] Move evaluation test (drag piece)
- [ ] Error path test (invalid FEN)

---

## Context

The chess coach is a fully working CLI app (Python). This plan builds the web layer on top of it:
- A **FastAPI server** wrapping the existing Python modules over HTTP
- A **React 18 + Tailwind frontend** per the `ui_spec.md` (Industrial Utilitarian design)

The CLI backend (`board_state.py`, `engine.py`, `heuristics.py`, `coach.py`) must not be modified except one addition to `coach.py`: `prune_history()`.

[//]: # (AGENT A: Claude's context window is finite. Without pruning, a long coaching session accumulates unbounded conversation_history — eventually the token count overflows and the API call fails. prune_history() caps at 20 messages and always preserves the first user+assistant pair, which contains the initial position analysis that grounds all subsequent coaching.)

---

## Critical Implementation Notes (Gotchas)

1. **`coach.py` needs `prune_history()`** — the only existing file we touch. Add the method and call it inside `_send()` before the Anthropic API call. Cap at 20 messages, always keep the first user+assistant pair.

2. **Delta in `/api/move`** — do NOT use `evaluate_move()`. Both `analyze_position` and `evaluate_move` use `score.white()` (always White's perspective), so the double-negation in `main.py:111` is incorrect. Instead:
   - Call `analyze_position(board, 3)` → `top_moves` (scores from White's perspective)
   - Call `analyze_position(board_after_user_move, 1)` → `user_move_analysis`
   - `delta = user_score - best_score` (positive = user move was better, negative = user move was worse)
   - No negation needed.

3. **`chess.Move` is not JSON-serializable** — `engine.analyze_position()` returns dicts with a `"move"` key containing a `chess.Move` object. Only serialize `san`, `score_cp`, `mate`, `pv` to JSON.

4. **PGN session continuity** — `/api/analyze` must call `bs.load_pgn()` (not `load_fen()`) when a PGN is provided, so the session `board_state` stays in PGN mode for subsequent `/api/pgn/navigate` calls.

5. **`load_dotenv()` order** — must be at the very top of `server.py`, before any local imports that read env vars (`EngineAnalysis` reads `STOCKFISH_PATH`).

6. **PV arrows use SAN, not UCI** — `topMoves[0].pv[0]` is a SAN string (e.g. `"d5"`). Client must parse it through `chess.js` on the current FEN to get `from`/`to` squares for `customArrows`.

7. **`chess.js` v1.x API** — import as `import { Chess } from 'chess.js'` (not `Chess()` constructor from v0.x).

---

## Phase 1: Backend (2 files to create, 1 to modify)

### Files

#### `sessions.py` (new)
```python
sessions: dict[str, dict] = {}
# Session: { coach, board_state, engine, created_at, last_active }

def get_or_create_session(session_id) -> (str, dict)
def get_session(session_id) -> dict | None
async def cleanup_sessions()  # loops every 5min, prunes > 30min idle, calls engine.stop()
```

#### `coach.py` (one addition)
```python
MAX_HISTORY = 20

def prune_history(self):
    if len(self.conversation_history) > MAX_HISTORY:
        initial = self.conversation_history[0:2]
        recent = self.conversation_history[-(MAX_HISTORY - 2):]
        self.conversation_history = initial + recent
# Call self.prune_history() in _send() after appending user message, before API call
```

#### `server.py` (new)
FastAPI app with lifespan that starts `cleanup_sessions()` background task.

**Endpoints:**

| Endpoint | Key Logic |
|---|---|
| `POST /api/validate` | Temp `BoardState`, `load_pgn()` or `load_fen()`, return FEN + legal_moves + pgn_metadata |
| `POST /api/analyze` | `get_or_create_session`, `load_pgn()`/`load_fen()`, engine → heuristics → coach, return full analysis |
| `POST /api/move` | `get_session`, sync FEN, `validate_and_parse_move`, engine top3 + `evaluate_move`, delta calc, `compare_moves`, `push_move` |
| `POST /api/chat` | `get_session`, `enrich_message(user_msg, fen)`, `coach.followup(enriched)` |
| `POST /api/pgn/navigate` | `get_session`, check `pgn_mode`, dispatch action → `pgn_next/prev/start/end` or `navigate_to_move` |

**Response envelope** (all endpoints):
```json
{ "ok": bool, "data": {...}, "error": {"code": str, "message": str} | null, "request_id": uuid }
```

**`enrich_message()` helper** (in server.py):
```python
def enrich_message(user_message: str, fen: str) -> str:
    board = chess.Board(fen)
    heuristics = extract_heuristics(board)
    heuristics_str = format_heuristics_for_prompt(heuristics)
    return (
        f"=== CURRENT BOARD STATE (Ground Truth) ===\n"
        f"FEN: {fen}\n"
        f"Side to move: {'White' if board.turn else 'Black'}\n\n"
        f"POSITIONAL FEATURES:\n{heuristics_str}\n\n"
        f"=== STUDENT'S QUESTION ===\n"
        f"{user_message}"
    )
```

**`format_top_moves()`** — copy verbatim from `main.py:14-20`.

**New deps:** `pip install fastapi uvicorn[standard]` → add to `requirements.txt`

> **PGN analyze behavior:** When PGN is submitted, `/api/analyze` loads the game at move 0 (starting position). The frontend shows the PGN navigator and the user advances manually. This matches `BoardState.load_pgn()` which initializes `pgn_current_index = 0`.

> **Frontend location:** `chess_coach/frontend/` (inside the repo). Best practice for a monorepo with a single backend + single frontend: co-locate them. The Python server and Vite dev server run on separate ports (8000 / 5173). The Vite proxy config handles `/api` routing. This matches `ui_spec.md Appendix B` exactly.

---

## Phase 2: Frontend Scaffold

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-chessboard chess.js
npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
```

#### `vite.config.ts`
Proxy `/api` → `http://localhost:8000` (eliminates CORS in dev).

#### `tailwind.config.js`
Extend colors with all tokens from ui_spec Appendix C. Override `borderRadius.DEFAULT: '0px'`.

#### `src/index.css`
- Google Fonts import (DM Sans + IBM Plex Mono)
- Tailwind directives
- CSS variables from Appendix C
- `@keyframes blink` for ThinkingIndicator
- `@keyframes flash-error` for illegal move feedback

---

## Phase 3: Component Build Order

Build bottom-up (atoms → molecules → organisms → app).

### `src/types.ts`
All TypeScript interfaces matching API shapes:
- `EngineMove`, `Heuristics`, `ChatMessage`, `AnalysisViewState`
- `AppState` discriminated union + `AppAction` union for `useReducer`

### `src/api.ts`
`apiFetch<T>(url, body, signal?)` → throws `ApiError(code, message)` on `ok: false`.

### Atoms
| Component | Key Detail |
|---|---|
| `MonoText` | `IBM Plex Mono`, `size` sm/md/lg = 12/14/16px |
| `SquareButton` | `border-radius: 0`, `loading` shows `"..."` text |
| `StatusPill` | `inline-flex`, `11px`, uppercase, `1px solid var(--border)` |
| `EvalBar` | `whitePct = 50 + clamp(scoreCp, -1000, 1000) / 20`, 16px wide, `transition: height 300ms` |

### Molecules
| Component | Key Detail |
|---|---|
| `FenInput` | `onBlur` validation only (not `onChange`), error state → `border: var(--error)` |
| `PgnInput` | `rows={6}`, same styling as FenInput |
| `MoveCard` | rank (muted) + SAN (mono bold) + eval (StatusPill) + PV (mono muted) |
| `ChatBubble` | Coach: `border-left: 2px solid var(--accent)`, no rounded corners, tiny `YOU`/`COACH` label |

### Organisms

#### `InputPanel.tsx`
Manages local fen/pgn state. On submit → dispatches to App reducer → App calls API.

#### `BoardPanel.tsx`
Most complex. Key patterns:
```typescript
// Optimistic update + revert
const prevFenRef = useRef(currentFen);
function handlePieceDrop(src, tgt): boolean {
  const game = new Chess(currentFen);
  const result = game.move({ from: src, to: tgt, promotion: 'q' });
  if (!result) return false; // snap back
  // Dispatch UPDATE_FEN optimistically, POST /api/move, revert on INVALID_MOVE
}

// PV arrows: parse SAN pv[0] through chess.js to get from/to squares
// ResizeObserver for responsive board width (320–640px)
```

#### `CoachPanel.tsx`
Auto-scroll with manual-override detection. "New message" pill when scrolled up.
ThinkingIndicator: `<p className="font-mono text-[13px] text-muted blinking-cursor">Coach is thinking...</p>`

#### `PgnNavigator.tsx`
Calls `/api/pgn/navigate` on prev/next/start/end. Highlights `*` marker in move display.

#### `AnalysisLayout.tsx`
CSS Grid `3fr 2fr`, `gap: 1px`, `background: var(--border)` on grid = 1px divider. Collapses to 1-col below 768px.

### `App.tsx`
`useReducer` state machine. All view transitions go through `dispatch`.

**Submit flow:**
1. Dispatch `SUBMIT` → state = `{ view: 'loading', step: 'validating', abortController }`
2. `POST /api/validate` → dispatch `SET_LOADING_STEP('engine')`
3. `POST /api/analyze` → dispatch `ANALYSIS_READY(data)`
4. On error → dispatch `ERROR(message, prefill: {fen, pgn})`
5. On abort → no-op (cancel button clicked)

---

## File Creation Order

**Backend (strict order):**
1. `sessions.py`
2. `coach.py` (add `prune_history`)
3. `server.py`

**Frontend (strict order):**
4. Vite scaffold + npm installs
5. `vite.config.ts`, `tailwind.config.js`, `src/index.css`
6. `src/types.ts`
7. `src/api.ts`
8. Atoms: `MonoText`, `SquareButton`, `StatusPill`, `EvalBar`
9. Molecules: `FenInput`, `PgnInput`, `MoveCard`, `ChatBubble`
10. Organisms: `InputPanel`, `BoardPanel`, `CoachPanel`, `PgnNavigator`, `AnalysisLayout`
11. `src/App.tsx`

---

## Verification

```bash
# Backend
pip install fastapi uvicorn[standard]
uvicorn server:app --reload --port 8000

# Smoke tests
curl -X POST http://localhost:8000/api/validate \
  -H "Content-Type: application/json" \
  -d '{"fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"}'

curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"}'
  # → copy session_id

# Frontend
cd frontend && npm run dev
# Open http://localhost:5173
# 1. Paste starting FEN → Analyze → verify board + engine lines + chat
# 2. Paste PGN → use navigator buttons
# 3. Drag a piece → verify coaching response
# 4. Type "bad fen" → verify error message, no board transition
```

---

## Critical Files to Reference During Implementation

| File | Why |
|---|---|
| `board_state.py` | PGN navigation return signatures; `pgn_mode` flag; `load_pgn()` vs `load_fen()` |
| `engine.py` | `EngineAnalysis` startup/teardown; `analyze_position` returns `chess.Move` objects |
| `coach.py:98` | `_send()` insertion point for `prune_history()` call |
| `main.py:14-20` | `format_top_moves()` to copy verbatim |
| `main.py:111` | Delta formula: `best["score_cp"] - (-user_eval["score_cp"])` |
| `ui_spec.md §3` | All API request/response shapes |
| `ui_spec.md §4` | All component prop interfaces |
| `ui_spec.md §7.1` | Full `data-testid` registry |
| `ui_spec.md Appendix C` | CSS variables |
