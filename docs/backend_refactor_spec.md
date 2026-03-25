# Backend Refactor Technical Specification

## Purpose

This specification defines the target backend architecture for the chess coach refactor described in `research.md`.

The desired backend must:

- initialize a coaching session from a user-supplied FEN or PGN
- treat client-supplied FEN as authoritative for the current position after initialization
- separate deterministic chess operations from LLM-generated coaching [//]: # (AGENT NOTE: LLM-generated coaching should ONLY be used to show LLM responses in chat box)
- expose structured navigation and move-history data instead of hidden string protocols
- remove endpoint coupling that currently mixes session setup, board mutation, engine analysis, and coach generation

This is a technical specification only. It defines behavior, contracts, interfaces, and acceptance criteria. It does not prescribe implementation code.

## Scope

### In Scope

- refactor of analysis, move, coaching, chat, and opponent-play API contracts
- session responsibilities and lifecycle for the refactored model
- data contracts returned to the frontend
- structured move history and PGN timeline contracts
- success criteria for endpoint behavior and system consistency

### Out Of Scope

- storage technology choice for long-term session persistence
- database schema design
- frontend UI implementation details beyond the backend-facing contracts
- model/vendor changes for the LLM or chess engine

## Design Principles

### 1. Client FEN Authority After Initialization

After the initial session bootstrap, the backend must treat the client-supplied FEN as the authoritative current position for:

- position analysis
- move validation
- move execution
- free-form chat context
- opponent move generation

The backend must not keep an independently authoritative mutable "current board" that can drift from the board shown in the frontend.

### 2. Initialization Authority Belongs To The Backend

At session creation time, the backend remains authoritative for:

- validating the initial user input
- parsing PGN into a mainline timeline [//]: # (AGENT NOTE: when a FEN string is provided, the initial FEN position must be added as the first move in the mainline timeline)
- choosing the canonical starting FEN
- constructing session metadata
- seeding coach conversation state

This means:

- a session is initialized from the user-provided FEN or PGN string
- only after that point does the client become authoritative for the live current position

### 3. Deterministic And Generative Work Must Be Split

The backend must separate:

- deterministic chess work
  - validate position
  - parse PGN
  - execute move
  - analyze position with Stockfish
  - compute heuristics
- generative coach work
  - position explanation
  - move comparison feedback
  - free-form coaching chat

No single endpoint should both mutate gameplay state and stream long-running LLM output.

### 4. Contracts Must Be Structured

The backend must stop relying on hidden contracts such as:

- `move_display` string parsing with a `*` marker
- state inferred from whether a caller used one endpoint vs another
- ambiguous field names such as `total_moves` that actually mean half-moves

All important navigation and move-history state must be returned in explicit structured objects.

### 5. Session State Must Store Context, Not Live Board Authority

The session should retain:

- coach conversation history
- initialization metadata
- optional PGN timeline and source metadata
- timestamps and lifecycle metadata

The session should not be the sole source of truth for the live current FEN after initialization.

## Target Behavior

### Session Bootstrap

When a user submits a FEN or PGN:

1. the backend validates the input
2. the backend creates a session
3. the backend derives the canonical initial position
4. if the input was PGN, the backend derives a full structured mainline timeline
5. the backend returns session metadata and the initial position contract
6. the frontend then requests deterministic analysis for the current FEN
7. the frontend may separately request the initial coach explanation for that position

### Position Analysis

Position analysis must become a pure operation over:

- `session_id`
- `fen`

The analysis endpoint must:

- not mutate live session board authority
- not reset PGN mode
- not alter move history
- not implicitly create a new session

It must only return deterministic outputs for the supplied position.

### Move Execution

Move execution must become a deterministic JSON operation over:

- `session_id`
- `fen_before`
- `move`

It must:

- validate the move against `fen_before`
- return the canonical `fen_after`
- return move metadata and resulting deterministic analysis
- return a normalized move-history entry
- not stream coach tokens

### Coach Position Explanation

Position coaching must be a distinct endpoint that explains a supplied position.

It must:

- accept `session_id` and `fen`
- optionally accept or derive already-computed analysis context
- stream or return only coaching content
- not mutate live gameplay position state

### Coach Move Feedback

Move coaching must be a distinct endpoint that compares a user move to the engine's preferred move.

It must:

- accept `session_id`
- accept the relevant position and move comparison context
- stream only coach feedback
- not be responsible for actually executing the move

### Free-Form Chat

Free-form chat must continue to use session conversation history, but the position context must come from the client-supplied FEN for the current board being viewed.

### PGN Navigation

The backend must stop requiring a stateful `/api/pgn/navigate` cursor as the primary navigation model.

Desired behavior:

- PGN timeline is derived at session initialization
- the frontend navigates positions by selecting an entry from the returned timeline
- the frontend updates its own current FEN from the selected timeline entry
- if fresh engine analysis is needed, the frontend calls the pure analyze endpoint for that FEN

Server-side PGN navigation may remain temporarily for migration compatibility, but it must not be the primary long-term contract.

## Target Session Model

### Session Responsibilities

Each session must retain:

- `session_id`
- `created_at`
- `last_active`
- initialization source metadata
- initial canonical position
- optional PGN timeline metadata
- coach conversation history
- engine resource handle or lazy engine configuration

### Session Must Not Be Responsible For

- being the sole live source of truth for current board position after initialization
- inferring current board state from stale internal mutation history
- reconciling frontend optimistic state through hidden board mutation

## API Surface

## JSON Envelope

All JSON endpoints must return the same envelope:


| Field        | Type           | Description                                |
| ------------ | -------------- | ------------------------------------------ |
| `ok`         | boolean        | Whether the request succeeded              |
| `data`       | object or null | Endpoint-specific payload                  |
| `error`      | object or null | Structured error payload                   |
| `request_id` | string         | Correlation ID for logs and client tracing |


### Error Object


| Field     | Type            | Description                        |
| --------- | --------------- | ---------------------------------- |
| `code`    | string          | Stable machine-readable error code |
| `message` | string          | Human-readable explanation         |
| `details` | object optional | Structured extra context           |


## Target Endpoints

### 1. `POST /api/validate`

Purpose:

- validate raw user input before session bootstrap

Request:


| Field | Type           | Required | Notes         |
| ----- | -------------- | -------- | ------------- |
| `fen` | string or null | no       | raw FEN input |
| `pgn` | string or null | no       | raw PGN input |


Response data:


| Field                 | Type               | Description                                 |
| --------------------- | ------------------ | ------------------------------------------- |
| `source_kind`         | `fen` or `pgn`     | Which input was selected                    |
| `canonical_start_fen` | string             | Canonical starting FEN after validation     |
| `turn`                | `White` or `Black` | Side to move at the starting position       |
| `legal_moves`         | string[]           | Legal SAN moves at the starting position    |
| `pgn_metadata`        | object or null     | Structured PGN metadata if PGN was supplied |


Behavior requirements:

- at least one of `fen` or `pgn` must be present
- if both are present, the product decision must be explicit and documented
- no session may be created here

### 2. `POST /api/session/init`

Purpose:

- create a session from validated user input and return initialization state

Request:


| Field         | Type           | Required    | Notes                             |
| ------------- | -------------- | ----------- | --------------------------------- |
| `source_kind` | `fen` or `pgn` | yes         | initialization mode               |
| `fen`         | string or null | conditional | required when `source_kind = fen` |
| `pgn`         | string or null | conditional | required when `source_kind = pgn` |


Response data:


| Field                  | Type               | Description                         |
| ---------------------- | ------------------ | ----------------------------------- |
| `session_id`           | string             | Session identifier                  |
| `source_kind`          | `fen` or `pgn`     | Stored initialization source        |
| `initial_position`     | object             | Canonical initial position contract |
| `timeline`             | `PositionTimeline` | Structured move/navigation timeline |
| `pgn_metadata`         | object or null     | Structured PGN metadata             |
| `session_capabilities` | object             | Feature availability flags          |


Behavior requirements:

- initializes session state from FEN or PGN
- when source is PGN, returns a structured mainline timeline
- when source is FEN, returns a timeline containing at least the initial position
- does not return a coach explanation by default

### 3. `POST /api/analyze`

Purpose:

- pure deterministic position analysis

Request:


| Field        | Type   | Required | Notes                                      |
| ------------ | ------ | -------- | ------------------------------------------ |
| `session_id` | string | yes      | active session                             |
| `fen`        | string | yes      | authoritative current position from client |


Response data:


| Field      | Type               | Description                               |
| ---------- | ------------------ | ----------------------------------------- |
| `position` | `PositionSnapshot` | Canonical snapshot of supplied FEN        |
| `analysis` | `PositionAnalysis` | Deterministic engine and heuristic output |


Behavior requirements:

- must not mutate live position state in the session
- must not reset PGN metadata or timeline
- must return deterministic outputs only
- must be safe to call repeatedly while browsing history

### 4. `POST /api/move`

Purpose:

- validate and execute a move deterministically

Request:


| Field              | Type            | Required                          | Notes                                      |
| ------------------ | --------------- | --------------------------------- | ------------------------------------------ |
| `session_id`       | string          | yes                               | active session                             |
| `fen_before`       | string          | yes                               | authoritative current position from client |
| `move`             | string          | yes                               | SAN or UCI                                 |
| `position_context` | object optional | optional cursor/timeline metadata |                                            |


Response data:


| Field             | Type                  | Description                                            |
| ----------------- | --------------------- | ------------------------------------------------------ |
| `position_before` | `PositionSnapshot`    | Canonical snapshot before move                         |
| `position_after`  | `PositionSnapshot`    | Canonical snapshot after move                          |
| `move_result`     | `MoveExecutionResult` | Move metadata and legality outcome                     |
| `analysis_after`  | `PositionAnalysis`    | Deterministic engine/heuristics for resulting position |
| `timeline_update` | `TimelineUpdate`      | Normalized move-history delta for the client           |


Behavior requirements:

- must be normal JSON, not SSE
- must be safe to call even if coach services are degraded
- must not depend on LLM success
- must return enough data for the frontend to update board, moves tab, and hint state immediately

### 5. `POST /api/coach/analyze-position`

Purpose:

- generate coaching commentary about a single supplied position

Request:


| Field              | Type            | Required                                             | Notes                          |
| ------------------ | --------------- | ---------------------------------------------------- | ------------------------------ |
| `session_id`       | string          | yes                                                  | active session                 |
| `fen`              | string          | yes                                                  | authoritative current position |
| `analysis_context` | object optional | optional deterministic analysis payload or cache key |                                |


Response type:

- streaming text response using SSE, or a documented non-streaming JSON variant if the product chooses not to stream this endpoint

Behavior requirements:

- must not mutate live gameplay position state
- may append to coach conversation history
- must operate on the supplied FEN, not hidden session board state

### 6. `POST /api/coach/analyze-move`

Purpose:

- generate Socratic feedback comparing the user's executed move with the engine's preferred move

Request:


| Field             | Type                       | Required | Notes                                |
| ----------------- | -------------------------- | -------- | ------------------------------------ |
| `session_id`      | string                     | yes      | active session                       |
| `fen_before`      | string                     | yes      | position before move                 |
| `fen_after`       | string                     | yes      | position after move                  |
| `move_result`     | `MoveExecutionResult`      | yes      | result returned by `/api/move`       |
| `analysis_before` | `PositionAnalysis` or null | optional | may be supplied by client or derived |
| `analysis_after`  | `PositionAnalysis` or null | optional | may be supplied by client or derived |


Response type:

- SSE stream with typed events

Behavior requirements:

- must not execute the move
- must not be the source of board state mutation
- may short-circuit with a structured "skip" event when the move is best or strong enough not to warrant feedback

### 7. `POST /api/chat`

Purpose:

- answer free-form follow-up questions in the context of the current displayed position

Request:


| Field        | Type   | Required | Notes                          |
| ------------ | ------ | -------- | ------------------------------ |
| `session_id` | string | yes      | active session                 |
| `fen`        | string | yes      | authoritative current position |
| `message`    | string | yes      | user question                  |


Response data:


| Field      | Type   | Description |
| ---------- | ------ | ----------- |
| `response` | string | Coach reply |


Behavior requirements:

- must enrich the message using the supplied FEN
- must use session conversation history
- must not rely on hidden mutable session board state

### 8. `POST /api/opponent-move`

Purpose:

- return the engine's selected reply move for the current displayed position

Request:


| Field        | Type   | Required | Notes                          |
| ------------ | ------ | -------- | ------------------------------ |
| `session_id` | string | yes      | active session                 |
| `fen`        | string | yes      | authoritative current position |
| `elo`        | number | yes      | requested opponent strength    |


Response data:


| Field             | Type                  | Description                                            |
| ----------------- | --------------------- | ------------------------------------------------------ |
| `position_before` | `PositionSnapshot`    | Canonical snapshot before move                         |
| `position_after`  | `PositionSnapshot`    | Canonical snapshot after move                          |
| `opponent_move`   | `MoveExecutionResult` | Opponent move metadata                                 |
| `analysis_after`  | `PositionAnalysis`    | Deterministic engine/heuristics for resulting position |
| `timeline_update` | `TimelineUpdate`      | Move-history delta for the client                      |


Behavior requirements:

- must operate on the supplied FEN
- must not depend on hidden live session board state

## SSE Contract For Coach Streaming Endpoints

If SSE is used for coach endpoints, the events must be explicit and stable.

### Required Events


| Event   | Description                                  |
| ------- | -------------------------------------------- |
| `start` | Stream accepted and coach generation started |
| `token` | Incremental text token or chunk              |
| `skip`  | Coach chose not to provide move feedback     |
| `error` | Structured coach generation failure          |
| `done`  | Stream completed successfully                |


### Prohibited Behavior

- deterministic move execution data must not be mixed into coach SSE streams
- board mutation success must not depend on SSE completion

## Shared Domain Contracts

## Position Snapshot


| Field         | Type               | Description                                                        |
| ------------- | ------------------ | ------------------------------------------------------------------ |
| `fen`         | string             | Canonical position FEN                                             |
| `turn`        | `White` or `Black` | Side to move                                                       |
| `move_index`  | number or null     | Half-move cursor if position corresponds to a known timeline entry |
| `source_kind` | `fen` or `pgn`     | Original session initialization source                             |


## Position Analysis


| Field             | Type           | Description                            |
| ----------------- | -------------- | -------------------------------------- |
| `top_moves`       | `EngineMove[]` | Ranked engine moves                    |
| `heuristics`      | `Heuristics`   | Deterministic position features        |
| `score_semantics` | object         | Explicit evaluation semantics metadata |


### `EngineMove`


| Field            | Type           | Description                                         |
| ---------------- | -------------- | --------------------------------------------------- |
| `san`            | string         | SAN move                                            |
| `uci`            | string         | UCI move                                            |
| `score_cp_white` | number or null | White-centric score                                 |
| `mate`           | number or null | Mate value                                          |
| `pv`             | string[]       | Structured line, SAN or clearly documented notation |
| `from_square`    | string         | Source square                                       |
| `to_square`      | string         | Destination square                                  |


### Score Semantics

The contract must explicitly state evaluation semantics.

Required fields:


| Field                 | Type    | Description                                                 |
| --------------------- | ------- | ----------------------------------------------------------- |
| `perspective`         | string  | Must declare whether scores are white-centric or normalized |
| `normalized_for_turn` | boolean | Whether UI may treat positive as favorable to side to move  |


## Move Execution Result


| Field                  | Type           | Description                                |
| ---------------------- | -------------- | ------------------------------------------ |
| `move_san`             | string         | Canonical SAN                              |
| `move_uci`             | string         | Canonical UCI                              |
| `from_square`          | string         | Source square                              |
| `to_square`            | string         | Destination square                         |
| `promotion`            | string or null | Promotion piece if any                     |
| `is_legal`             | boolean        | Whether move was legal                     |
| `is_best_move`         | boolean        | Whether move matches engine-best threshold |
| `user_move_eval_white` | number or null | White-centric move evaluation              |
| `best_move_eval_white` | number or null | White-centric best-move evaluation         |
| `delta_cp_white`       | number or null | White-centric delta                        |


## Position Timeline


| Field             | Type              | Description                                        |
| ----------------- | ----------------- | -------------------------------------------------- |
| `entries`         | `TimelineEntry[]` | Ordered position timeline                          |
| `current_index`   | number            | Initial cursor index                               |
| `navigation_mode` | `timeline`        | Indicates client-side timeline navigation contract |


### `TimelineEntry`


| Field               | Type                                                          | Description                                                  |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| `index`             | number                                                        | Half-move index                                              |
| `fen`               | string                                                        | FEN at this point in the timeline                            |
| `turn`              | `White` or `Black`                                            | Side to move at this point                                   |
| `san`               | string or null                                                | SAN move that produced this position; null for initial entry |
| `move_number_label` | string or null                                                | Human-readable label such as `1. e4` or `2...Nc6`            |
| `source`            | `initial` or `pgn_mainline` or `live_play` or `opponent_play` | Timeline origin                                              |


## Timeline Update


| Field               | Type                                                  | Description                        |
| ------------------- | ----------------------------------------------------- | ---------------------------------- |
| `mode`              | `append` or `truncate_and_append` or `replace_cursor` | How frontend should merge update   |
| `entries`           | `TimelineEntry[]`                                     | New entries produced by the action |
| `new_current_index` | number                                                | Cursor after merge                 |


## PGN Metadata


| Field              | Type           | Description                      |
| ------------------ | -------------- | -------------------------------- |
| `white`            | string or null | White player                     |
| `black`            | string or null | Black player                     |
| `event`            | string or null | Event name                       |
| `total_half_moves` | number         | Number of half-moves in mainline |
| `start_fen`        | string         | Starting FEN                     |


## Interface Requirements By Module

### `server.py`

Must be responsible for:

- request validation
- endpoint orchestration
- response shaping
- consistent error handling

Must not contain:

- hidden coupling between board mutation and coach streaming
- multiple competing notions of live position authority

### `board_state.py`

Must be responsible for:

- input parsing
- initial FEN / PGN bootstrap
- legal move parsing and validation
- timeline construction helpers

Must not be responsible for:

- authoritative live board state after initialization
- hidden PGN cursor mutation required for normal frontend navigation

### `coach.py`

Must be responsible for:

- generating position explanations
- generating move-comparison feedback
- preserving conversation history for the session

Must not be responsible for:

- deciding whether a move is legally played
- mutating board state

### `engine.py`

Must be responsible for:

- deterministic position and move analysis
- opponent move selection
- stable evaluation semantics

Must expose enough metadata for frontend hint features without requiring the frontend to reverse-engineer source and destination squares from SAN.

## Error Handling Requirements

### Deterministic Endpoints

The following endpoints must return structured JSON errors:

- `/api/validate`
- `/api/session/init`
- `/api/analyze`
- `/api/move`
- `/api/chat`
- `/api/opponent-move`

### Streaming Coach Endpoints

The following endpoints must surface structured stream errors:

- `/api/coach/analyze-position`
- `/api/coach/analyze-move`

Required behavior:

- a coach failure must not roll back a successful deterministic move
- move success and coach success must be independently observable

## Migration Constraints

### Compatibility Expectations

- temporary compatibility shims may exist during migration
- hidden string protocol fields such as `move_display` may be supported briefly for transition
- the long-term contract must prefer structured timeline entries

### Existing Behavior That Must Be Eliminated

- `/api/analyze` resetting PGN mode when analyzing an arbitrary FEN
- `/api/move` mixing board mutation and LLM streaming
- ambiguous authority between session board state and client FEN
- stale internal session board positions becoming a different source of truth than the UI

## Success Criteria

The backend refactor is successful when all of the following are true:

1. `/api/analyze` is a pure deterministic analysis endpoint over `session_id + fen`.
2. `/api/move` is deterministic JSON and does not stream coach output.
3. coach move feedback is delivered by a separate endpoint.
4. no endpoint requires hidden live session board authority after initialization.
5. PGN browsing does not require calling `/api/analyze` in a way that resets PGN state.
6. the backend returns structured move/timeline data for both PGN-started and FEN-started sessions.
7. frontend can rebuild the Moves tab purely from returned structured contracts.
8. engine failure and coach failure are isolated and independently reportable.
9. evaluation semantics are explicit in the API contract.
10. request/response tracing is consistent across endpoints.

## Non-Functional Success Criteria

- deterministic endpoints should return fast enough for responsive board interaction
- coach streaming should begin only after deterministic move execution has already succeeded
- no orphaned endpoint behavior should depend on parsing hidden display strings
- the refactored contract should be testable with realistic fixtures rather than special-case mocks

