# Frontend Refactor Technical Specification

## Purpose

This specification defines the target frontend behavior and architecture for the analysis screen refactor described in `research.md`.

The desired frontend must:

- turn the current chat-only right panel into a tabbed Coach/Moves rail
- support persistent navigation and hint toolbars
- keep position, analysis, and move-history state synchronized
- work for both PGN-started sessions and FEN-started sessions
- align with the backend contract defined in `backend_refactor_spec.md`

This document defines desired functionality, UI behavior, state ownership, interfaces, and success criteria. It does not include implementation code.

## Scope

### In Scope

- refactor of the analysis screen rooted in `frontend/src/App.tsx`
- right-rail redesign
- shared state boundaries between `App.tsx`, `BoardPanel.tsx`, and `CoachPanel.tsx`
- Moves tab behavior for PGN and FEN flows
- hint toolbar behavior and board overlays
- frontend contracts expected from the backend refactor
- UI-level success criteria and test expectations

### Out Of Scope

- visual design beyond the behavior and structural requirements below
- package-level implementation details
- backend persistence implementation
- voice, browser persistence, or external chess site integrations

## Product Goals

The refactored analysis screen must make the application feel like a single coordinated chess analysis workspace rather than two loosely connected panels.

The most important user-facing outcomes are:

1. the right rail becomes a shared control surface for both coaching and move exploration
2. the Moves tab works for both PGN starts and FEN starts
3. the board only shows hints when the user asks for them
4. board state, move history, and analysis remain synchronized while navigating and exploring sidelines

## Desired Screen Behavior

## Analysis Layout

The analysis screen remains a two-panel layout:

- left panel: board and board-adjacent rendering
- right panel: Coach/Moves rail

The layout may continue using the existing `AnalysisLayout.tsx` shell, but the right panel must become a richer stateful surface driven by shared props from `App.tsx`.

## Right Rail Structure

The right rail must contain, from top to bottom:

1. tab row
2. navigation toolbar
3. hint toolbar
4. active tab content

These top three controls must remain persistent regardless of which tab is selected.

### Tabs

Required tabs:

- `Coach`
- `Moves`

Behavior:

- exactly one tab is active at a time
- switching tabs must not clear chat history, move history, or hint state
- switching tabs must not trigger re-analysis on its own

### Navigation Toolbar

Required buttons:

- `start`
- `previous`
- `next`
- `end`

Behavior:

- toolbar is always visible
- buttons operate on the current move timeline, not on a backend-only PGN cursor
- buttons are disabled when the action is not possible
- navigation changes the currently displayed board position
- navigation triggers deterministic position analysis for the selected position
- navigation does not automatically trigger a new coach message in the chat thread unless product requirements explicitly change later

### Hint Toolbar

Required buttons:

- lightbulb
- question mark

Behavior:

- toolbar is always visible
- if there is no valid current analysis, both hint buttons are disabled
- lightbulb toggles the best-line overlay on the board
- question mark toggles highlighting of the source square of the engine-best move
- toggles persist while the user switches between `Coach` and `Moves`
- when the current position changes, the hint overlay must update to the best move of the new position

### Coach Tab

The `Coach` tab must contain:

- chat composer at the top
- conversation list beneath it
- any existing chat status indicators such as coach-thinking state and new-message affordance

Behavior:

- chat input is anchored at the top of the tab content area
- messages render below the composer in chronological order
- chat history persists across tab switches
- sending a question uses the currently displayed FEN, not a stale board position

### Moves Tab

The `Moves` tab must show a move navigation/history surface that supports:

- PGN-started sessions
- FEN-started sessions
- live updates as moves are played
- sideline exploration from historical positions

Behavior for PGN-started sessions:

- initial timeline is seeded from the backend PGN timeline
- selecting a move updates the current board position
- if the user plays a move from a historical position, the future mainline after the current cursor is truncated and the new move is appended as a sideline continuation in the active timeline

Behavior for FEN-started sessions:

- initial timeline contains the starting position
- each user move appends a new move entry
- opponent moves also append new entries when opponent mode is active
- start/previous/next/end work against this evolving timeline

Empty-state behavior:

- a FEN-started session with no moves yet must still show a valid Moves tab
- the UI must communicate that the timeline currently contains only the starting position

## Board Behavior

### BoardPanel Responsibilities

`BoardPanel.tsx` must remain responsible for rendering:

- chessboard position
- arrows and square highlights
- board sizing
- move drag/drop interaction
- optional opponent-thinking state

`BoardPanel` must not become the owner of shared right-rail state.

### Board Hint Presentation

Board overlay behavior must follow the shared hint state:

- if `showBestLine = false`, no best-line arrow or line is shown
- if `showBestLine = true`, render the best line from the current analysis
- if `showBestMoveSource = true`, highlight the source square of the engine-best move
- if both toggles are off, no hint overlay is shown

### Local Validation vs Canonical Result

The frontend may continue to validate drag-and-drop locally with `chess.js` for responsiveness, but canonical state must be reconciled with the backend move response.

## Desired Functional Flows

## Session Initialization

### FEN Start

Flow:

1. user submits FEN
2. app validates input
3. user selects side/orientation if required by product flow
4. app initializes session
5. app receives starting position and timeline
6. app requests deterministic analysis for the starting FEN
7. app optionally requests initial coach explanation
8. analysis screen renders with `Coach` tab active by default

### PGN Start

Flow:

1. user submits PGN
2. app validates input
3. app initializes session
4. app receives starting position, PGN metadata, and structured timeline
5. app requests deterministic analysis for the starting FEN
6. app optionally requests initial coach explanation
7. analysis screen renders with PGN move history available in the Moves tab

## Position Navigation

When the user navigates via toolbar or move list:

1. active timeline cursor changes
2. `currentFen` and `turn` are updated from the selected timeline entry
3. current deterministic analysis is refreshed for that FEN
4. hint overlays update from the new analysis while preserving the toggle state
5. chat input continues to ask questions about the newly displayed position

## User Move Submission

When the user plays a move:

1. board validates the attempted move locally
2. app submits deterministic move request to backend
3. app receives canonical `fen_after`, `turn_after`, move metadata, and deterministic analysis
4. app updates:
   - current position
   - current analysis
   - timeline
   - hint overlays derived from the new analysis
5. if move coaching is enabled for that move, app starts the separate coach stream
6. coach stream updates chat independently of move success

### Required User-Perceived Behavior

- board should feel responsive
- deterministic move result must appear before coach commentary finishes
- a coach failure must not undo a successful move

## Opponent Move Submission

When opponent mode is enabled:

1. app submits the current displayed FEN to the opponent endpoint
2. app receives canonical resulting position and deterministic analysis
3. app appends opponent move to timeline
4. board and hints update to the new position
5. system chat may note the opponent move

## Free-Form Chat

When the user sends a question:

1. app uses the current displayed FEN
2. app posts the message with session context
3. app appends user message immediately
4. app appends coach reply when received

Behavior requirements:

- chat must not depend on a stale server-side board cursor
- tab switches must not reset in-progress chat state

## State Architecture

## State Ownership Principle

Shared state that affects both the right rail and the board must live in `App.tsx` (or an equivalent top-level analysis controller).

This includes:

- current displayed position
- deterministic analysis for the current position
- timeline and current timeline cursor
- right-rail toolbar state
- coach message thread
- async status for moves, analysis, and coach streams

Purely local presentation state may remain inside leaf components.

## App-Level Analysis State

The top-level analysis screen state must include at least the following domains:

### Session Domain

| Field | Description |
| --- | --- |
| `sessionId` | Active session identifier |
| `sourceKind` | Whether the session started from FEN or PGN |
| `pgnMetadata` | Optional PGN metadata |
| `capabilities` | Backend-advertised feature flags |

### Position Domain

| Field | Description |
| --- | --- |
| `currentFen` | Currently displayed position FEN |
| `turn` | Side to move at the current position |
| `currentTimelineIndex` | Current cursor into the move timeline |
| `timeline` | Structured move timeline |

### Analysis Domain

| Field | Description |
| --- | --- |
| `currentAnalysis` | Deterministic analysis for the current displayed FEN |
| `analysisByFen` | Optional cache of previously fetched analyses |
| `isAnalyzingPosition` | Whether deterministic analysis is in flight |
| `analysisError` | Last deterministic analysis error |

### Coach Domain

| Field | Description |
| --- | --- |
| `messages` | Full coach conversation list |
| `isCoachStreaming` | Whether a coach endpoint is streaming |
| `coachError` | Last coach error |

### Right Rail Domain

| Field | Description |
| --- | --- |
| `activeTab` | `Coach` or `Moves` |
| `showBestLine` | Best-line toggle state |
| `showBestMoveSource` | Best-move source highlight toggle state |

### Move Submission Domain

| Field | Description |
| --- | --- |
| `isSubmittingMove` | Whether a deterministic move request is active |
| `isWaitingForOpponent` | Whether opponent reply is in flight |
| `lastMoveResult` | Most recent move execution result |

## Local Component State

### `CoachPanel`

Allowed local state:

- composer text
- autoscroll behavior
- local unread-message affordances

Not allowed as local-only state:

- hint toggle state
- current timeline cursor
- current analysis
- authoritative current FEN

### `BoardPanel`

Allowed local state:

- board width
- transient drag interaction state
- ephemeral hover/focus rendering state

Not allowed as local-only state:

- authoritative hint toggle state
- move-history ownership
- authoritative current position

## Component Responsibilities

## `App.tsx`

Must be the shared analysis coordinator.

Responsibilities:

- own analysis-screen reducer/state
- orchestrate API calls
- synchronize current position, analysis, timeline, and chat
- pass presentational props and callbacks to board and right rail

## `AnalysisLayout.tsx`

Must remain a layout shell only.

Responsibilities:

- two-panel placement
- responsive stack behavior

Must not own data or async logic.

## `BoardPanel.tsx`

Responsibilities:

- render board
- surface move attempts upward
- render hint overlays based on props
- render any board-adjacent status indicators

Must not directly own the right-rail control model.

## `CoachPanel.tsx`

Responsibilities:

- render tabs
- render both persistent toolbars
- render coach tab
- render moves tab
- emit user interactions upward through callbacks

Must not be the sole owner of board-affecting state.

## Moves Surface

The existing `PgnNavigator.tsx` may be reused only as a presentational or subcomponent primitive.

It is not sufficient as the long-term data model because:

- it is PGN-only
- it depends on hidden `move_display` string semantics
- it cannot represent FEN-started move history by itself

The desired Moves surface must be powered by the structured timeline contract from the backend.

## Dependency And Asset Policy

### Icons

Preferred options:

- inline SVG
- local icon components

Adding a new icon dependency is permitted only if it clearly reduces complexity and remains consistent with existing UI conventions.

### Existing Libraries

The refactor should continue to rely on:

- React
- Tailwind styling conventions already in the app
- `chess.js` for local move validation and timeline calculations where appropriate
- `react-chessboard` for board rendering

## Frontend Data Contracts

This section defines the frontend-facing interfaces expected from the backend and from internal state boundaries.

## `PositionSnapshot`

| Field | Description |
| --- | --- |
| `fen` | Canonical current FEN |
| `turn` | Side to move |
| `moveIndex` | Current timeline index or null |
| `sourceKind` | `fen` or `pgn` |

## `PositionAnalysis`

| Field | Description |
| --- | --- |
| `topMoves` | Ranked engine moves for current position |
| `heuristics` | Deterministic heuristic payload |
| `scoreSemantics` | Explicit evaluation semantics metadata |

## `MoveTimeline`

| Field | Description |
| --- | --- |
| `entries` | Ordered `MoveTimelineEntry[]` |
| `currentIndex` | Active cursor |
| `canNavigate` | Whether navigation controls are active |

## `MoveTimelineEntry`

| Field | Description |
| --- | --- |
| `index` | Half-move index |
| `fen` | FEN at this step |
| `turn` | Side to move |
| `san` | SAN move that created this position, or null for the initial entry |
| `moveNumberLabel` | Human-readable move label |
| `source` | `initial`, `pgn_mainline`, `live_play`, or `opponent_play` |

## `MoveExecutionResult`

| Field | Description |
| --- | --- |
| `moveSan` | Canonical SAN |
| `moveUci` | Canonical UCI |
| `fromSquare` | Source square |
| `toSquare` | Destination square |
| `isBestMove` | Best-move threshold result |
| `deltaCpWhite` | White-centric delta |

## `RightRailState`

| Field | Description |
| --- | --- |
| `activeTab` | `Coach` or `Moves` |
| `showBestLine` | Toggle state |
| `showBestMoveSource` | Toggle state |

## `CoachMessage`

| Field | Description |
| --- | --- |
| `role` | `user`, `coach`, or `system` |
| `content` | Message content |
| `timestamp` | Created time |
| `streaming` | Whether the message is still being streamed |

## Component Interface Requirements

## `CoachPanel` External Interface

`CoachPanel` must receive at least:

| Prop Domain | Description |
| --- | --- |
| `rightRailState` | Active tab and hint toggles |
| `timeline` | Full move timeline and cursor |
| `currentAnalysis` | Analysis for current position |
| `messages` | Chat thread |
| `status` | Thinking/streaming/loading flags |
| `callbacks` | Tab, navigation, hint, send, and reset handlers |

## `BoardPanel` External Interface

`BoardPanel` must receive at least:

| Prop Domain | Description |
| --- | --- |
| `position` | Current position snapshot |
| `analysis` | Current deterministic analysis |
| `hintState` | Best-line and source-square toggle state |
| `moveStatus` | Move and opponent activity flags |
| `callbacks` | Move-attempt handler and any board-driven events |

## Behavior Requirements For Key UI Features

## Lightbulb Button

Required behavior:

- toggles best-line visibility
- does not mutate move history or coach messages
- if current analysis changes, displayed line updates automatically
- if no analysis exists, button is disabled

## Question-Mark Button

Required behavior:

- toggles source-square highlight for engine-best move
- highlight must use explicit source-square metadata from the analysis contract, not SAN re-parsing in the UI
- if no analysis exists, button is disabled

## Navigation Buttons

Required behavior:

- navigate the unified timeline
- work identically for PGN and FEN-start sessions
- disable correctly at bounds
- retain hint toggle state while changing the selected position

## Chat Composer Position

Required behavior:

- input sits above the conversation list in the Coach tab
- new coach messages append beneath the input area
- switching away from the tab does not discard in-progress draft text unless product requirements explicitly choose to do so later

## Loading And Error States

### Deterministic Analysis Loading

When navigating or loading a new position:

- board should continue displaying the last known current position
- analysis-dependent hint buttons may temporarily disable until new analysis arrives
- loading state must be explicit but lightweight

### Coach Streaming

When a coach endpoint is active:

- chat UI should indicate streaming/thinking state
- deterministic board updates must remain usable unless product chooses to lock input for a specific reason

### Error Handling

Required behavior:

- deterministic move errors do not append malformed coach messages
- coach-stream errors do not revert successful moves
- UI presents system messages or error states consistently

## Testing Requirements

The refactor must update tests so that they reflect runtime truth instead of stale contracts.

Required coverage areas:

1. FEN initialization flow, including side selection if retained
2. PGN initialization flow with populated Moves tab
3. Moves tab behavior for a FEN-started session
4. navigation toolbar enable/disable rules
5. lightbulb toggle updates board hint visibility
6. question-mark toggle updates source-square highlight
7. chat input is rendered above conversation list
8. deterministic move success is independent from coach streaming success
9. sideline exploration truncates and appends timeline correctly

Fixtures must align with the refactored backend contract:

- deterministic move responses are JSON
- coach move feedback uses a separate stream contract
- timeline data is structured, not encoded in `move_display`

## Migration Notes

The current codebase has dormant or stale pieces that the refactor must account for:

- `flashSquare` must be replaced by explicit highlight state driven by props
- `moveHistory` in current app state is not yet a real timeline model
- `PgnNavigator.tsx` cannot remain the sole long-term moves model
- current engine-line and eval-bar UI are commented out and may be reintroduced only if they fit the new screen design

## Success Criteria

The frontend refactor is successful when all of the following are true:

1. the right rail contains `Coach` and `Moves` tabs at the top
2. the navigation toolbar is always visible below the tabs
3. the hint toolbar is always visible below the navigation toolbar
4. the `Coach` tab renders the chat composer above the conversation list
5. the `Moves` tab works for both PGN-started and FEN-started sessions
6. toolbar state that affects the board is owned above `CoachPanel` and `BoardPanel`
7. changing the selected move updates the displayed board position and deterministic analysis together
8. best-line and best-move-source overlays update from the current analysis without requiring separate local board state ownership
9. a successful move does not depend on coach stream success
10. no frontend feature depends on parsing a hidden `move_display` string as the primary data model

## Non-Functional Success Criteria

- the analysis screen feels responsive during move play and navigation
- hint controls behave predictably and do not flicker across tab switches
- the Moves tab remains understandable even in a FEN-started session with only a few moves
- the refactored screen can be tested with realistic fixtures that match the backend contracts
