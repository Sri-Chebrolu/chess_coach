# Plan: Backend Refactor

## To-Do List

### Phase 1 — New Endpoints
- [x] Add `POST /api/session/init`: creates session, returns `session_id`, `source_kind`, `initial_position`, `timeline` (full PGN mainline or single entry for FEN), `pgn_metadata`, `session_capabilities`
- [x] Add `POST /api/coach/coach-analyze`: SSE endpoint; accepts `session_id`, `fen_before`, `fen_after`, `move_result`, optional `analysis_before`/`analysis_after`; events: `start | token | skip | error | done`
- [x] Add `POST /api/coach/analyze-position`: accepts `session_id`, `fen`, optional `analysis_context`; returns or streams coach explanation; events (if SSE): `start | token | error | done`

### Phase 2 — Refactor Existing Endpoints
- [x] Refactor `POST /api/analyze`: pure read — accepts `session_id + fen` only; must not reset PGN mode, must not create sessions, must not mutate session board state; returns `position` + `analysis`
- [x] Refactor `POST /api/move`: remove SSE entirely; return deterministic JSON with `position_before`, `position_after`, `move_result`, `analysis_after`, `timeline_update`
- [x] Refactor `POST /api/opponent-move`: return same structured shape as `/api/move` — `position_before`, `position_after`, `opponent_move`, `analysis_after`, `timeline_update`
- [x] Update `POST /api/validate`: rename response fields to `canonical_start_fen` (was `fen`) and add `source_kind` field

### Phase 3 — Module Updates
- [x] Update `engine.py`: add `uci`, `from_square`, `to_square` to every `EngineMove` output; rename score field to `score_cp_white` (white-centric, always positive = white advantage); add `score_semantics: { perspective: "white", normalized_for_turn: false }` to `PositionAnalysis`
- [x] Update `board_state.py`: add `build_timeline(pgn_string) -> list[TimelineEntry]` helper that returns structured entries for the full PGN mainline; add `build_initial_timeline(fen) -> list[TimelineEntry]` for FEN sessions

### Phase 4 — Cleanup
- [x] Remove `POST /api/pgn/navigate` endpoint (client-side timeline replaces it)
- [x] Remove hidden `move_display` string from all responses (replaced by structured `TimelineEntry`)

---

## Response Contracts

All JSON responses use the envelope:
```json
{ "ok": true, "data": { ... }, "error": null, "request_id": "uuid" }
```

### `POST /api/validate`
Response `data`:
```json
{
  "source_kind": "fen" | "pgn",
  "canonical_start_fen": "string",
  "turn": "White" | "Black",
  "legal_moves": ["e4", "d4", ...],
  "pgn_metadata": { "white", "black", "event", "total_half_moves", "start_fen" } | null
}
```

### `POST /api/session/init`
Request: `{ source_kind, fen?, pgn? }`
Response `data`:
```json
{
  "session_id": "uuid",
  "source_kind": "fen" | "pgn",
  "initial_position": { "fen", "turn", "move_index", "source_kind" },
  "timeline": {
    "entries": [
      {
        "index": 0,
        "fen": "string",
        "turn": "White" | "Black",
        "san": null,
        "move_number_label": null,
        "source": "initial"
      }
      // ... pgn_mainline entries follow for PGN sessions
    ],
    "current_index": 0,
    "navigation_mode": "timeline"
  },
  "pgn_metadata": { ... } | null,
  "session_capabilities": { "opponent_mode": true }
}
```

### `POST /api/analyze`
Request: `{ session_id, fen }`
Response `data`:
```json
{
  "position": { "fen", "turn", "move_index", "source_kind" },
  "analysis": {
    "top_moves": [
      {
        "san": "e4",
        "uci": "e2e4",
        "score_cp_white": 35,
        "mate": null,
        "pv": ["e4", "c5", "Nf3"],
        "from_square": "e2",
        "to_square": "e4"
      }
    ],
    "heuristics": { ... },
    "score_semantics": { "perspective": "white", "normalized_for_turn": false }
  }
}
```

### `POST /api/move`
Request: `{ session_id, fen_before, move, position_context? }`
Response `data`:
```json
{
  "position_before": { "fen", "turn", "move_index", "source_kind" },
  "position_after": { "fen", "turn", "move_index", "source_kind" },
  "move_result": {
    "move_san": "e4",
    "move_uci": "e2e4",
    "from_square": "e2",
    "to_square": "e4",
    "promotion": null,
    "is_legal": true,
    "is_best_move": false,
    "user_move_eval_white": 20,
    "best_move_eval_white": 35,
    "delta_cp_white": -15
  },
  "analysis_after": { "top_moves": [...], "heuristics": {...}, "score_semantics": {...} },
  "timeline_update": {
    "mode": "append" | "truncate_and_append" | "replace_cursor",
    "entries": [ { "index", "fen", "turn", "san", "move_number_label", "source": "live_play" } ],
    "new_current_index": 1
  }
}
```

### `POST /api/opponent-move`
Request: `{ session_id, fen, elo }`
Response `data`: same structure as `/api/move` response, with `opponent_move` instead of `move_result`, and `source: "opponent_play"` in timeline entries.

### `POST /api/coach/coach-analyze`
Request: `{ session_id, fen_before, fen_after, move_result, analysis_before?, analysis_after? }`
SSE events:
```
event: start
data: {}

event: token
data: {"token": "The move e4..."}

event: skip
data: {"reason": "best_move"}

event: error
data: {"message": "Coach unavailable"}

event: done
data: {}
```

### `POST /api/coach/analyze-position`
Request: `{ session_id, fen, analysis_context? }`
Same SSE event format as `coach-analyze`, or JSON `{ "data": { "response": "string" } }`.

---

## Module Responsibilities

### `server.py`
- Request validation and endpoint orchestration only
- No hidden coupling between board mutation and LLM streaming
- All endpoints return structured JSON or typed SSE; no `move_display` strings

### `board_state.py`
- Input parsing and initial bootstrap
- `build_timeline(pgn_string)` → `list[TimelineEntry]`
- `build_initial_timeline(fen, turn)` → `list[TimelineEntry]` (single entry)
- Legal move parsing and validation
- Must NOT be the authoritative live board after initialization

### `engine.py`
- `analyze_position(board) -> PositionAnalysis` (includes `score_semantics`)
- Every `EngineMove` must include `uci`, `from_square`, `to_square`, `score_cp_white`
- `get_opponent_move(board, elo) -> MoveExecutionResult`

### `coach.py`
- `compare_moves_stream(...)` → generator of SSE tokens (for `/api/coach/coach-analyze`)
- `analyze_position_stream(...)` → generator of SSE tokens (for `/api/coach/analyze-position`)
- Must not mutate board state

---

## Key Constraints

- `/api/move` must be fast JSON — no LLM calls, no SSE
- A coach failure must never roll back a successful move
- `/api/analyze` must be safe to call repeatedly during navigation without side effects
- All evaluation scores use `score_cp_white` (white-centric); include `score_semantics` so frontend can interpret correctly
- `TimelineEntry.source` must be one of: `initial | pgn_mainline | live_play | opponent_play`

---

## Critical Files

| File | Change |
|------|--------|
| `server.py` | Add 3 new endpoints; refactor `/api/move`, `/api/analyze`, `/api/opponent-move`, `/api/validate`; remove `/api/pgn/navigate` |
| `board_state.py` | Add `build_timeline` + `build_initial_timeline` helpers |
| `engine.py` | Add `uci`, `from_square`, `to_square`, `score_cp_white`, `score_semantics` to outputs |
| `coach.py` | Add `analyze_position_stream` method; rename/adapt `compare_moves_stream` to accept new request shape |

---

## Verification

1. `POST /api/session/init` with a PGN → `timeline.entries` has all moves, each with `fen`, `san`, `move_number_label`
2. `POST /api/session/init` with a FEN → `timeline.entries` has one entry with `san: null`, `source: "initial"`
3. `POST /api/analyze` with `session_id + fen` → returns analysis, no session mutation
4. `POST /api/move` → returns JSON synchronously; `is_legal: true`; `timeline_update.mode` is `append`
5. `POST /api/coach/coach-analyze` → SSE stream with `start`, then `token` events, then `done`
6. Call `/api/analyze` twice with same FEN → identical deterministic result
7. `engine.py` output includes `from_square`, `to_square`, `uci` on every move
