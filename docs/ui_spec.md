# UI Specification: Socratic AI Chess Coach

> **Version:** 2.0  
> **Status:** Source of Truth  
> **Audience:** Human developers, AI coding agents, QA automation  
> **Stack:** React 18 + Tailwind CSS (frontend) | FastAPI + existing Python modules (backend) [//]: # (AGENT NOTE: revisit the technology/framework choices after reviewing the user intent/stories)

---

## Table of Contents

1. [System Objective, Personas & Design Philosophy](#1-system-objective-personas--design-philosophy)
2. [Application State Machine](#2-application-state-machine)
3. [Data Contracts (The API Bridge)](#3-data-contracts-the-api-bridge)
4. [Component Hierarchy](#4-component-hierarchy)
5. [Agentic Context Rules](#5-agentic-context-rules)
6. [Error & Edge Case Handling](#6-error--edge-case-handling)
7. [Testing Hooks](#7-testing-hooks)

---

## 1. System Objective, Personas & Design Philosophy

### 1.1 System Objective

Build a web interface for an AI chess coach that teaches through the **Socratic method** — asking questions to guide understanding rather than dispensing answers. The system is grounded in deterministic engine analysis (Stockfish) and positional heuristics, with an LLM synthesizing principle-based feedback from those facts.

The behavioral anchor is the existing system prompt in `coach.py`:

```
You are an expert chess coach. You teach through the Socratic method —
asking questions to guide understanding rather than just giving answers.

RULES:
- ONLY reference facts provided in the BOARD ANALYSIS section. Never invent board state.
- Ground all advice in chess principles: center control, piece development, king safety,
  pawn structure, piece activity, tactical motifs.
- When comparing moves, explain the trade-offs in terms of these principles.
- Keep responses concise (1-2 paragraphs max).
- End with a thought-provoking question when appropriate.
```
[//]: # (AGENT NOTE: provide actual link to the prompt in coach.py)

The frontend does not replace this logic. It exposes it over HTTP and renders the results.

### 1.2 User Personas

**The Improver** — Rated 1200-1800 ELO. Reviews their own games after a session on Chess.com or Lichess. Pastes PGN exports. Wants to understand *why* a move is bad, not just *that* it is bad. Navigates through full games. Asks follow-up questions like "What if I had castled instead?"

**The Explorer** — Casual player or student. Copies a FEN from a YouTube video or puzzle website. Wants a quick read on a single position. May not know what "center control" means yet — the Socratic method meets them where they are.

### 1.3 Design Philosophy: Industrial Utilitarian

The interface is a **control panel, not a landing page**. It is a tool for serious work — analyzing chess positions — and its aesthetics must serve that function.

#### Principles

| Principle | Implementation |
|---|---|
| Tools, not toys | Every pixel earns its place. No decorative elements. |
| Data density over white space | FEN strings, eval scores, and move lists are first-class citizens, rendered in monospace at comfortable sizes. |
| Sharp geometry | 0px border-radius on all interactive elements. 1px solid borders. No drop shadows except on the board itself. |
| High-contrast legibility | Light text on dark surfaces. Accent color used sparingly for actionable elements only. |
| Honest loading states | Show what is actually happening ("Running Stockfish...", "Consulting coach..."), not a generic spinner. |

#### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#0a0a0a` | Page background |
| `--bg-surface` | `#141414` | Cards, panels, input fields |
| `--bg-elevated` | `#1e1e1e` | Hover states, active elements |
| `--border` | `#2a2a2a` | Panel borders, dividers |
| `--text-primary` | `#e8e8e8` | Body text, labels |
| `--text-secondary` | `#888888` | Placeholders, timestamps |
| `--text-muted` | `#555555` | Disabled states |
| `--accent` | `#769656` | Buttons, active states, board dark squares |
| `--accent-hover` | `#8aaa6a` | Button hover |
| `--error` | `#cc4444` | Validation errors, illegal moves |
| `--warning` | `#b8860b` | Timeouts, retries |
| `--eval-white` | `#e8e8e8` | Eval bar white advantage |
| `--eval-black` | `#1a1a1a` | Eval bar black advantage |
| `--board-light` | `#eeeed2` | Board light squares |
| `--board-dark` | `#769656` | Board dark squares |

#### Typography

| Role | Font | Weight | Fallback |
|---|---|---|---|
| UI headings | DM Sans | 600 | system-ui, sans-serif |
| UI body | DM Sans | 400 | system-ui, sans-serif |
| Data / FEN / PGN / Eval | IBM Plex Mono | 400 | 'Courier New', monospace |
| Chat messages | DM Sans | 400 | system-ui, sans-serif |
| Move notation | IBM Plex Mono | 500 | 'Courier New', monospace |

Load via Google Fonts:
```
https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap
```

#### Anti-Patterns ("No AI Slop")

The following are explicitly banned from this interface:

- Purple-to-blue gradients on backgrounds or buttons
- Floating particles, orbs, or ambient animations
- Border-radius > 2px on interactive elements
- Glassmorphism or frosted-glass effects
- Skeleton loaders (use deterministic progress text instead)
- Generic "AI assistant" avatars or chat bubbles with rounded corners
- Gratuitous shadows (box-shadow allowed only on the chessboard for depth)
- Inter, Roboto, Arial, or system-ui as the primary display font
- Emoji in UI labels or status indicators

---

## 2. Application State Machine

### 2.1 State Diagram

```
                    SUBMIT_VALID
  ┌──────────┐ ──────────────────► ┌──────────────┐
  │           │                     │              │
  │ InputView │ ◄── SUBMIT_INVALID  │ LoadingState  │
  │           │ ◄── LOAD_ERROR      │              │
  └──────────┘ ◄── RESET           └──────┬───────┘
                                          │
                                     DATA_READY
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │              │
                                   │ AnalysisView │
                                   │              │
                                   └──────────────┘
                                     │         ▲
                                     │         │
                                     └─────────┘
                                    NEW_ANALYSIS
                               (move drop or re-analyze)
```

### 2.2 State Definitions

#### InputView (Initial State)

**Purpose:** Gather chess data before initializing the engine.

**Layout:** Centered single-column, max-width 560px, vertically centered in viewport.

**Visible components:**
- `FenInput` — textarea labeled "FEN String", placeholder: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`
- `PgnInput` — textarea labeled "PGN Data", placeholder: `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6...`
- `SubmitButton` — labeled "Analyze Position", disabled until at least one input is non-empty
- Inline validation error text (if previous submission failed)

**Transition logic:**
- On submit, POST to `POST /api/validate` with `{ fen, pgn }`.
- If response `ok: true` → transition to **LoadingState** with validated FEN.
- If response `ok: false` → remain in **InputView**, display `error.message` inline.

#### LoadingState (Transient State)

**Purpose:** Show deterministic progress while the backend processes.

**Layout:** Same centered column as InputView. Inputs are hidden; replaced by progress text.

**Visible components:**
- Step indicator showing current operation:
  - Step 1: `"Validating positions..."` (during `/api/validate`)
  - Step 2: `"Running analysis..."` (during engine phase of `/api/analyze`)
  - Step 3: `"Consulting coach..."` (during LLM phase of `/api/analyze`)
- A `Cancel` link that transitions back to **InputView** (aborts the fetch via `AbortController`).

**Transition logic:**
- On `/api/analyze` success → transition to **AnalysisView** with full response data.
- On error → transition to **InputView** with error message pre-filled.

#### AnalysisView (Active State)

**Purpose:** Interactive board and contextual AI coaching.

**Layout:** Two-column CSS Grid. Left 60% (board + engine lines), right 40% (coach chat). Collapses to single-column stack below 768px viewport width.

**State shape (held in React):**

```typescript
interface AnalysisViewState {
  sessionId: string;             // UUID, generated by backend on first /api/analyze
  currentFen: string;            // updated on every board change
  initialFen: string;            // the FEN that started this session
  turn: 'White' | 'Black';
  moveHistory: string[];         // SAN notation list
  topMoves: EngineMove[];        // from /api/analyze response
  heuristics: Heuristics;        // from /api/analyze response
  chatMessages: ChatMessage[];   // full conversation
  isCoachThinking: boolean;      // true while awaiting LLM response
}
```

**Transition logic:**
- User drops a piece → optimistic FEN update → POST `/api/move` → append coach response to chat.
- User sends a chat message → POST `/api/chat` with hidden FEN → append response.
- User clicks "New Game" → transition to **InputView** (RESET).

### 2.3 TypeScript Discriminated Union

```typescript
type AppState =
  | { view: 'input'; error?: string; prefill?: { fen?: string; pgn?: string } }
  | { view: 'loading'; step: 'validating' | 'engine' | 'coach'; abortController: AbortController }
  | { view: 'analysis'; data: AnalysisViewState };
```

All view-switching logic must go through a single `dispatch` function (useReducer) to prevent impossible state combinations.

---

## 3. Data Contracts (The API Bridge)

All endpoints are served by a FastAPI application that wraps the existing Python modules (`board_state.py`, `engine.py`, `heuristics.py`, `coach.py`). No new chess logic is written — the API is a thin HTTP shell around `main.py`'s command handlers.

### 3.1 Response Envelope

Every response follows this structure:

```json
{
  "ok": true,
  "data": { ... },
  "error": null,
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

On failure:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "INVALID_FEN",
    "message": "Invalid FEN: expected 6 space-separated fields, got 4"
  },
  "request_id": "550e8400-e29b-41d4-a716-446655440001"
}
```

The `request_id` is a UUID v4, also returned as the `X-Request-Id` HTTP header for log correlation.

### 3.2 `POST /api/validate`

Lightweight validation without engine or LLM calls. Used by the InputView on submit.

**Request:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "pgn": null
}
```
At least one of `fen` or `pgn` must be non-null. If both are provided, `pgn` takes precedence.

**Response (`data`):**
```json
{
  "valid": true,
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "turn": "Black",
  "legal_moves": ["Nf6", "Nc6", "d5", "e5", "c5", "..."],
  "pgn_metadata": null
}
```

When loading PGN, `pgn_metadata` is populated:
```json
{
  "pgn_metadata": {
    "white": "Kasparov",
    "black": "Deep Blue",
    "event": "IBM Man-Machine",
    "total_half_moves": 48,
    "fen_at_start": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  }
}
```

**Backend mapping:**
- `BoardState.load_fen(fen)` — raises `ValueError` on invalid FEN
- `BoardState.load_pgn(pgn)` — returns `(bool, str)` tuple
- `BoardState.get_legal_moves_san()` — populates `legal_moves`

**Error codes:** `INVALID_FEN`, `INVALID_PGN`, `EMPTY_INPUT`

### 3.3 `POST /api/analyze`

Full analysis pipeline: engine + heuristics + LLM coaching. This is the primary endpoint.

**Request:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "session_id": null
}
```

If `session_id` is null, the backend creates a new session and returns its ID. If provided, the existing session's `Coach` conversation history is reused.

**Response (`data`):**
```json
{
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "turn": "Black",
  "top_moves": [
    {
      "san": "d5",
      "score_cp": 25,
      "mate": null,
      "pv": ["d5", "exd5", "Qxd5", "Nc3", "Qa5"]
    },
    {
      "san": "e5",
      "score_cp": 15,
      "mate": null,
      "pv": ["e5", "Nf3", "Nc6", "Bb5", "a6"]
    },
    {
      "san": "Nf6",
      "score_cp": 10,
      "mate": null,
      "pv": ["Nf6", "e5", "Nd5", "d4", "d6"]
    }
  ],
  "heuristics": {
    "material": {
      "white": 39,
      "black": 39,
      "balance": 0,
      "description": "White: 39 pts, Black: 39 pts (balance: +0)"
    },
    "center_control": {
      "white_controls": 3,
      "black_controls": 1,
      "description": "Center control — White: 3/4, Black: 1/4"
    },
    "piece_activity": {
      "white_activity": 29,
      "black_activity": 22,
      "description": "Piece activity (squares attacked) — White: 29, Black: 22"
    },
    "king_safety": {
      "white": { "attackers": 0, "in_check": false, "castled": false, "pawn_shield": 2 },
      "black": { "attackers": 0, "in_check": false, "castled": false, "pawn_shield": 2 }
    },
    "pawn_structure": {
      "white": [],
      "black": []
    },
    "tactics": [],
    "development": {
      "white": ["Ng1", "Bc1", "Bf1"],
      "black": ["Nb8", "Ng8", "Bc8", "Bf8"]
    }
  },
  "coach_response": "This position arises after 1. e4. White has staked a claim in the center..."
}
```

**Backend mapping:**
- `EngineAnalysis.analyze_position(board, num_moves=3)` → `top_moves`
- `extract_heuristics(board)` → `heuristics`
- `format_heuristics_for_prompt(heuristics)` + `format_top_moves(top_moves)` → prompt assembly
- `Coach.analyze_position(fen, turn, top_moves_str, heuristics_str)` → `coach_response`
- New `Coach()` instance stored in `sessions[session_id]`

**Error codes:** `INVALID_FEN`, `ENGINE_TIMEOUT`, `LLM_RATE_LIMIT`, `LLM_CONNECTION_ERROR`

### 3.4 `POST /api/move`

Evaluate a user's move against the engine's best. Maps to the `move` command in `main.py`.

**Request:**
```json
{
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "move": "Nc6"
}
```

The `move` field accepts SAN (`Nc6`) or UCI (`b8c6`) notation.

**Response (`data`):**
```json
{
  "valid": true,
  "fen_after": "r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2",
  "turn_after": "White",
  "user_move": {
    "san": "Nc6",
    "score_cp": -15,
    "mate": null
  },
  "best_move": {
    "san": "d5",
    "score_cp": 25,
    "mate": null
  },
  "delta_cp": 40,
  "top_moves": [
    {
      "san": "d5",
      "score_cp": 25,
      "mate": null,
      "pv": ["d5", "exd5", "Qxd5"]
    }
  ],
  "heuristics_before": { "...same shape as /api/analyze heuristics..." },
  "heuristics_after": { "...heuristics of position after user's move..." },
  "coach_response": "You chose Nc6, developing a knight toward the center..."
}
```

**Backend mapping:**
- `BoardState.validate_and_parse_move(move)` → validates move legality
- `EngineAnalysis.analyze_position(board, 3)` → `top_moves` + `best_move`
- `EngineAnalysis.evaluate_move(board, move)` → `user_move` eval
- Delta calculation: `best.score_cp - (-user_eval.score_cp)`
- `extract_heuristics(board)` → `heuristics_before`
- `extract_heuristics(board_after_move)` → `heuristics_after`
- `Coach.compare_moves(...)` → `coach_response`

**Error codes:** `INVALID_MOVE`, `INVALID_FEN`, `SESSION_NOT_FOUND`, `ENGINE_TIMEOUT`, `LLM_RATE_LIMIT`

### 3.5 `POST /api/chat`

Free-form follow-up questions. The FEN is injected as hidden context.

**Request:**
```json
{
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "What if I had castled instead?",
  "fen": "r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2"
}
```

**Response (`data`):**
```json
{
  "response": "That's a great question. At this point in the game, castling would...",
  "tokens": {
    "input": 1247,
    "output": 312
  }
}
```

**Backend mapping:**
- Retrieve `Coach` instance from `sessions[session_id]`
- Prepend hidden context to user message (see Section 5.1)
- `Coach.followup(enriched_message)` → `response`
- Token counts from `response.usage.input_tokens` / `response.usage.output_tokens`

**Error codes:** `SESSION_NOT_FOUND`, `EMPTY_MESSAGE`, `LLM_RATE_LIMIT`, `LLM_CONNECTION_ERROR`

### 3.6 `POST /api/pgn/navigate`

Navigate within a loaded PGN game. Returns the board state at a given half-move index.

**Request:**
```json
{
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "action": "goto",
  "move_index": 5
}
```

`action` is one of: `"goto"`, `"next"`, `"prev"`, `"start"`, `"end"`. The `move_index` field is only required for `"goto"`.

**Response (`data`):**
```json
{
  "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  "turn": "White",
  "move_index": 5,
  "total_moves": 48,
  "last_move_san": "Nf6",
  "move_display": "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *",
  "legal_moves": ["d4", "O-O", "Nc3", "d3", "..."]
}
```

**Backend mapping:**
- `BoardState.navigate_to_move(move_index)` / `pgn_next()` / `pgn_prev()` / `pgn_start()` / `pgn_end()`
- `BoardState.get_pgn_moves_display()` → `move_display`
- `BoardState.get_legal_moves_san()` → `legal_moves`

**Error codes:** `SESSION_NOT_FOUND`, `NO_PGN_LOADED`, `INVALID_MOVE_INDEX`

---

## 4. Component Hierarchy

The UI follows Atomic Design: **Atoms** (indivisible elements) → **Molecules** (small functional groups) → **Organisms** (complete UI sections).

### 4.1 Atoms

#### `MonoText`

Renders any chess data (FEN, PGN, eval scores, move notation) in `IBM Plex Mono`.

```typescript
interface MonoTextProps {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';  // 12px | 14px | 16px
  color?: 'primary' | 'secondary' | 'muted' | 'accent';
  as?: 'span' | 'p' | 'code';
}
```

#### `SquareButton`

Sharp-cornered button. No border-radius. 1px solid border.

```typescript
interface SquareButtonProps {
  label: string;
  onClick: () => void;
  variant: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;         // shows "..." animation, not a spinner
  fullWidth?: boolean;
}
```

Variants:
- `primary`: `background: var(--accent)`, `color: #0a0a0a`, `border: 1px solid var(--accent)`
- `ghost`: `background: transparent`, `color: var(--text-primary)`, `border: 1px solid var(--border)`
- `danger`: `background: transparent`, `color: var(--error)`, `border: 1px solid var(--error)`

#### `StatusPill`

Compact inline badge for metadata.

```typescript
interface StatusPillProps {
  label: string;              // e.g., "White to move", "+1.2", "Mate in 3"
  variant: 'neutral' | 'positive' | 'negative' | 'warning';
}
```

Rendered as `display: inline-flex`, `padding: 2px 8px`, `font-size: 11px`, `text-transform: uppercase`, `letter-spacing: 0.05em`, `border: 1px solid var(--border)`.

#### `EvalBar`

Vertical bar showing engine evaluation. Placed as a gutter to the left of the chessboard.

```typescript
interface EvalBarProps {
  scoreCp: number;            // centipawns from white's perspective
  mate: number | null;        // null if no forced mate
  height: number;             // matches board height in px
}
```

Rendering logic:
- `score_cp = 0` → bar is 50% white, 50% black
- Clamp display range to [-1000, +1000] cp (beyond that, show as full bar)
- `mate !== null` → bar is 100% for the winning side
- Width: 16px. No border-radius. Transition: `height 300ms ease`.

### 4.2 Molecules

#### `FenInput`

Textarea with inline validation state.

```typescript
interface FenInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;             // shown as red text below the textarea
  disabled?: boolean;
}
```

Specs:
- Label: "FEN String" in DM Sans 500, 13px, `var(--text-secondary)`
- Textarea: `IBM Plex Mono`, `var(--bg-surface)` background, `var(--border)` border
- Placeholder: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`
- On error: border color changes to `var(--error)`, error text appears below
- Height: 2 rows (resizable vertically)

#### `PgnInput`

Textarea for multi-line PGN data.

```typescript
interface PgnInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}
```

Specs:
- Label: "PGN Data" in DM Sans 500, 13px, `var(--text-secondary)`
- Textarea: same styling as `FenInput` but with 6 rows default height
- Placeholder: `[Event "Casual Game"]\n[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6...`

#### `MoveCard`

Displays a single engine line with evaluation.

```typescript
interface MoveCardProps {
  rank: number;               // 1, 2, 3
  san: string;                // "d5"
  scoreCp: number;
  mate: number | null;
  pv: string[];               // ["d5", "exd5", "Qxd5", "Nc3", "Qa5"]
  isUserMove?: boolean;       // highlights differently if this is the user's played move
}
```

Layout: single row — rank number (dimmed), SAN in `IBM Plex Mono` bold, eval as `StatusPill`, PV continuation in `IBM Plex Mono` dimmed. Border-bottom `1px solid var(--border)`.

#### `ChatBubble`

A single message in the coach conversation.

```typescript
interface ChatBubbleProps {
  role: 'user' | 'coach';
  content: string;            // may contain markdown
  timestamp: string;          // ISO 8601
  index: number;              // for data-testid
}
```

Styling:
- **User messages**: aligned left, `var(--bg-elevated)` background, 1px border
- **Coach messages**: aligned left (no right-alignment — this is not iMessage), `var(--bg-surface)` background, left border `2px solid var(--accent)`
- Content rendered with basic markdown (bold, italic, inline code for move notation)
- No rounded corners. No avatars. Role indicated by a small label: `YOU` or `COACH` in 10px uppercase.

### 4.3 Organisms

#### `InputPanel`

The complete InputView screen. Composes `FenInput`, `PgnInput`, and `SquareButton`.

Layout:
```
┌─────────────────────────────┐
│                             │
│     SOCRATIC CHESS COACH    │  ← DM Sans 600, 18px, var(--text-primary)
│                             │
│  ┌───────────────────────┐  │
│  │ FEN String            │  │  ← FenInput
│  │ rnbqkbnr/pppp...      │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ PGN Data              │  │  ← PgnInput
│  │ 1. e4 e5 2. Nf3...    │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │   ANALYZE POSITION    │  │  ← SquareButton primary
│  └───────────────────────┘  │
│                             │
│  Invalid FEN: expected...   │  ← Error text (if any)
│                             │
└─────────────────────────────┘
```

Max-width: 560px. Centered horizontally and vertically (CSS Grid `place-items: center` on body).

#### `BoardPanel`

Interactive chessboard with eval bar and engine lines.

**`react-chessboard` integration:**

```typescript
import { Chessboard } from 'react-chessboard';

<Chessboard
  position={currentFen}
  onPieceDrop={handlePieceDrop}
  boardWidth={boardWidth}
  customBoardStyle={{
    border: '1px solid var(--border)',
  }}
  customDarkSquareStyle={{ backgroundColor: '#769656' }}
  customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
  customArrows={pvArrows}
  animationDuration={200}
/>
```

**`onPieceDrop` handler logic:**

```typescript
function handlePieceDrop(sourceSquare: string, targetSquare: string): boolean {
  // 1. Construct UCI move string
  const moveUci = sourceSquare + targetSquare;

  // 2. Optimistically update local FEN (using chess.js on the client)
  const gameCopy = new Chess(currentFen);
  const result = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });

  if (!result) return false; // illegal move — piece snaps back

  // 3. Update local state immediately
  setCurrentFen(gameCopy.fen());
  setIsCoachThinking(true);

  // 4. POST to backend for coaching feedback
  fetch('/api/move', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, fen: previousFen, move: result.san }),
  })
    .then(res => res.json())
    .then(data => {
      if (!data.ok) {
        if (data.error.code === 'INVALID_MOVE') {
          // Illegal/impossible move rejected by backend — revert board
          setCurrentFen(previousFen);
          flashSquare(sourceSquare, 'error'); // red flash on source square
        } else {
          // Analysis failed (ENGINE_TIMEOUT, LLM_RATE_LIMIT, etc.) — keep board, show error in chat
          appendChatMessage('system', `Analysis failed: ${data.error.message}. Try again.`);
        }
        return;
      }
      appendChatMessage('coach', data.data.coach_response);
      setTopMoves(data.data.top_moves);
    })
    .catch(() => {
      // Network failure — revert board
      setCurrentFen(previousFen);
      appendChatMessage('system', 'Connection lost. Check your network and try again.');
    })
    .finally(() => setIsCoachThinking(false));

  return true; // accept the drop
}
```

**Board sizing:** `boardWidth` is computed from the container width using a `ResizeObserver`. The board always fills 100% of its grid column, minus padding. Minimum: 320px. Maximum: 640px.

**PV arrow rendering:** After `/api/analyze`, the best move's first two squares are drawn as a green arrow using the `customArrows` prop: `[[fromSquare, toSquare, 'rgba(118, 150, 86, 0.6)']]`.

**Layout within BoardPanel:**

```
┌──┬──────────────────────┐
│  │                      │
│E │                      │
│v │     Chessboard       │
│a │     (interactive)    │
│l │                      │
│  │                      │
│  │                      │
└──┴──────────────────────┘
┌─────────────────────────┐
│ 1. d5  (+25cp) d5→exd5  │  ← MoveCard
│ 2. e5  (+15cp) e5→Nf3   │  ← MoveCard
│ 3. Nf6 (+10cp) Nf6→e5   │  ← MoveCard
└─────────────────────────┘
```

#### `CoachPanel`

Chat interface with the AI coach.

**Sub-components:**
- `ChatHistory` — scrollable container of `ChatBubble` components
- `ChatInput` — textarea + send button
- `ThinkingIndicator` — shown when `isCoachThinking` is true

**ChatHistory scroll logic (detailed):**

```typescript
const messagesEndRef = useRef<HTMLDivElement>(null);
const containerRef = useRef<HTMLDivElement>(null);
const [autoScroll, setAutoScroll] = useState(true);
const [hasNewMessage, setHasNewMessage] = useState(false);

// Detect manual scroll-up
function handleScroll() {
  const el = containerRef.current;
  if (!el) return;
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  setAutoScroll(isAtBottom);
  if (isAtBottom) setHasNewMessage(false);
}

// Auto-scroll on new message
useEffect(() => {
  if (autoScroll) {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  } else {
    setHasNewMessage(true);
  }
}, [chatMessages.length]);
```

If the user has scrolled up and a new message arrives, a "New message" pill appears at the bottom of the chat container. Clicking it sets `autoScroll = true` and scrolls to bottom.

**ChatInput context injection:**

The chat input's send handler attaches the current FEN as hidden metadata:

```typescript
async function handleSendMessage(userText: string) {
  appendChatMessage('user', userText);
  setIsCoachThinking(true);

  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      message: userText,        // user's visible text
      fen: currentFen,          // hidden metadata — user never sees this in the UI
    }),
  });

  const result = await response.json();
  appendChatMessage('coach', result.data.response);
  setIsCoachThinking(false);
}
```

The user types "Why is castling good here?" — the frontend silently appends the FEN. The backend (see Section 5) prepends board context to the message before sending to Claude.

**ThinkingIndicator:**

Not a spinner. A single line of text: `"Coach is thinking..."` in `IBM Plex Mono`, 13px, `var(--text-muted)`, with a blinking cursor animation (CSS `@keyframes blink`). Appears as the last item in `ChatHistory`.

**Layout within CoachPanel:**

```
┌─────────────────────────┐
│ COACH                   │  ← Header, DM Sans 600, 13px, uppercase
├─────────────────────────┤
│                         │
│ [COACH] This position   │  ← ChatBubble
│ arises after 1.e4...    │
│                         │
│ [YOU] What about Nc6?   │  ← ChatBubble
│                         │
│ [COACH] Good question.  │  ← ChatBubble
│ Nc6 develops toward...  │
│                         │
│ Coach is thinking...█   │  ← ThinkingIndicator
│                         │
│ ┌─── New message ───┐   │  ← Scroll pill (conditional)
│ └───────────────────┘   │
├─────────────────────────┤
│ ┌─────────────────┬───┐ │
│ │ Ask a question...│ → │ │  ← ChatInput + Send button
│ └─────────────────┴───┘ │
└─────────────────────────┘
```

#### `AnalysisLayout`

Top-level organism composing the two panels.

```css
.analysis-layout {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 1px;
  height: 100vh;
  background: var(--border); /* gap acts as a 1px divider */
}

.analysis-layout > * {
  background: var(--bg-primary);
}

@media (max-width: 768px) {
  .analysis-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
}
```

The 1px gap with `var(--border)` background creates a sharp divider line between panels without needing an explicit border element.

#### `PgnNavigator` (conditional)

Shown only when a PGN game is loaded. Sits between the board and engine lines.

```
┌─────────────────────────────────┐
│ ⏮  ◀  Move 5 / 48  ▶  ⏭       │
│ 1. e4 e5 2. Nf3 Nc6 3. Bc4 *   │  ← move list with position marker
└─────────────────────────────────┘
```

Buttons call `POST /api/pgn/navigate` with `action: "start" | "prev" | "next" | "end"`. The move list uses `MonoText` with the current position highlighted in `var(--accent)`.

---

## 5. Agentic Context Rules

These rules prevent the LLM coach from "hallucinating" about board state or losing track of the current position during multi-turn conversations. They are non-negotiable correctness requirements.

### 5.1 Rule: FEN-as-Metadata on Every Message

**What:** Every `POST /api/chat` request includes the current FEN string. The user never sees this in the UI — it is injected by the frontend from React state.

**Why:** The user may make several moves between chat messages. Without the current FEN, the coach would answer about a stale position.

**Backend implementation:**

```python
# In the /api/chat endpoint handler:
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

The enriched message is what gets passed to `Coach.followup()`. The raw `user_message` is stored for display; the enriched version is stored in `conversation_history`.

### 5.2 Rule: Session Isolation

**What:** Each coaching session gets a fresh `Coach()` instance with an empty `conversation_history`.

**Implementation:**

```python
import uuid
from datetime import datetime, timedelta

sessions: dict[str, dict] = {}

# Session structure:
# {
#     "coach": Coach(),
#     "board_state": BoardState(),
#     "engine": EngineAnalysis(),
#     "created_at": datetime,
#     "last_active": datetime,
# }

def get_or_create_session(session_id: str | None) -> tuple[str, dict]:
    if session_id and session_id in sessions:
        session = sessions[session_id]
        session["last_active"] = datetime.utcnow()
        return session_id, session

    new_id = str(uuid.uuid4())
    sessions[new_id] = {
        "coach": Coach(),
        "board_state": BoardState(),
        "engine": EngineAnalysis(),
        "created_at": datetime.utcnow(),
        "last_active": datetime.utcnow(),
    }
    sessions[new_id]["engine"].start()
    return new_id, sessions[new_id]
```

**TTL:** Sessions expire after 30 minutes of inactivity. A background task (FastAPI `on_event("startup")`) runs every 5 minutes to prune expired sessions and call `engine.stop()` on their Stockfish instances.

### 5.3 Rule: Ground Truth Injection

**What:** The backend ALWAYS computes fresh heuristics from the current FEN before any LLM call — even for free-form follow-up questions.

**Why:** This ensures the coach's `SYSTEM_PROMPT` rule ("ONLY reference facts provided in the BOARD ANALYSIS section") is always satisfiable. Without fresh heuristics, the coach might be asked about a position it has no ground-truth data for.

**Applies to:**
- `POST /api/analyze` — full heuristics in position analysis prompt
- `POST /api/move` — heuristics before + after in move comparison prompt
- `POST /api/chat` — heuristics prepended to followup (via `enrich_message()`)

### 5.4 Rule: History Pruning

**What:** The `conversation_history` in each `Coach` instance is capped at 20 messages (10 user + 10 assistant pairs).

**Why:** Claude has a context window limit. Unbounded history causes token overflow on long sessions.

**Implementation:**

```python
MAX_HISTORY = 20

def prune_history(self):
    if len(self.conversation_history) > MAX_HISTORY:
        # Always keep message[0] (the initial position analysis — the grounding context)
        initial = self.conversation_history[0:2]  # first user + assistant pair
        recent = self.conversation_history[-(MAX_HISTORY - 2):]
        self.conversation_history = initial + recent
```

Called inside `Coach._send()` before constructing the API request.

### 5.5 Rule: No Client-Side LLM Calls

The frontend NEVER calls the Anthropic API directly. All LLM interaction goes through the backend, which controls prompt construction, context injection, and history management. This is a security and correctness boundary — the client cannot bypass ground-truth injection.

---

## 6. Error & Edge Case Handling

### 6.1 Error Matrix

| Scenario | Detection Point | Error Code | UI Behavior |
|---|---|---|---|
| Empty FEN and PGN | Client-side | (none) | Submit button shows as disabled (`var(--text-muted)` text, no hover effect) |
| Invalid FEN syntax | `POST /api/validate` | `INVALID_FEN` | Red border on FEN input, error message shown below: `"Invalid FEN: {message}"` |
| Invalid PGN syntax | `POST /api/validate` | `INVALID_PGN` | Red border on PGN input, error message shown below: `"Invalid PGN: {message}"` |
| Illegal/impossible move (client) | Client-side `chess.js` rejects move | (none) | Piece snaps back to origin square. Red flash (100ms) on the source square via CSS animation. No toast or alert. |
| Illegal/impossible move (server) | `POST /api/move` returns `INVALID_MOVE` | `INVALID_MOVE` | Board reverts to previous FEN. Red flash on source square. No chat message — the visual revert is sufficient feedback. |
| Move analysis failed | `POST /api/move` returns `ENGINE_TIMEOUT` or `LLM_RATE_LIMIT` | `ENGINE_TIMEOUT`, `LLM_RATE_LIMIT` | Board keeps the new position (move was legal). A system message appears in chat: `"Analysis failed: {message}. Try again."` User can retry via chat or make another move. |
| Engine timeout (>10s) | Backend timeout wrapper | `ENGINE_TIMEOUT` | Loading text changes to `"Engine is taking longer than expected..."`. Cancel button becomes prominent. After 30s, auto-cancel and return to InputView with error. |
| LLM rate limit (429) | `coach.py` retry logic | `LLM_RATE_LIMIT` | Loading text changes to `"Coach is busy. Retrying in {n}s..."` with countdown. Retry logic already exists in `Coach._send()` (exponential backoff, 3 attempts). |
| LLM connection error | `coach.py` catch block | `LLM_CONNECTION_ERROR` | Show `"Connection lost. Check your network."` with a `[Retry]` button in the chat area. |
| API server unreachable | `fetch()` throws `TypeError` | (none) | Full-viewport overlay: `"Backend unavailable"` + `[Retry]` button + suggestion to check if server is running. |
| Session expired / not found | Backend returns 404 | `SESSION_NOT_FOUND` | Auto-create a new session silently. Show a toast: `"Session refreshed"` (3s auto-dismiss). Previous chat history is lost — this is expected for v1. |
| PGN navigation out of bounds | Backend validation | `INVALID_MOVE_INDEX` | Navigation button becomes disabled (dimmed). No error toast — just prevent the action. |

### 6.2 Validation Timing

FEN/PGN validation is **not** performed on every keystroke. It fires:

1. On submit button click (primary validation path)
2. On blur of the textarea (secondary, for early feedback)
3. NOT on input/change events (avoids noisy error states while typing)

### 6.3 Network Retry Strategy

All `fetch()` calls use a shared utility:

```typescript
async function apiFetch<T>(url: string, body: object, signal?: AbortSignal): Promise<ApiResponse<T>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { code: 'UNKNOWN', message: 'Request failed' } }));
    throw new ApiError(error.error.code, error.error.message);
  }

  return response.json();
}
```

No automatic client-side retries for non-idempotent requests. The backend handles retries for the LLM (already implemented in `coach.py`). The client shows retry buttons for explicit user-initiated retries.

---

## 7. Testing Hooks

### 7.1 `data-testid` Registry

Every interactive or state-dependent element must have a `data-testid` attribute. These are the contract between the UI and automated test runners (Playwright, Cypress, or agentic test agents).

**InputView:**

| Element | `data-testid` |
|---|---|
| FEN textarea | `fen-input` |
| PGN textarea | `pgn-input` |
| Submit / Analyze button | `submit-button` |
| Validation error text | `error-message` |

**LoadingState:**

| Element | `data-testid` |
|---|---|
| Loading container | `loading-state` |
| Step text (e.g., "Running Stockfish...") | `loading-step` |
| Cancel link | `loading-cancel` |

**AnalysisView — Board Panel:**

| Element | `data-testid` |
|---|---|
| Board container (wrapping `react-chessboard`) | `chess-board` |
| Eval bar | `eval-bar` |
| Engine line (by index) | `engine-line-0`, `engine-line-1`, `engine-line-2` |
| Move card (by SAN) | `move-card-d5`, `move-card-e5`, etc. |
| PGN navigator container | `pgn-navigator` |
| PGN prev button | `pgn-prev` |
| PGN next button | `pgn-next` |
| PGN start button | `pgn-start` |
| PGN end button | `pgn-end` |
| PGN move display | `pgn-moves` |

**AnalysisView — Coach Panel:**

| Element | `data-testid` |
|---|---|
| Chat history scroll container | `chat-history` |
| Individual chat message (by index) | `chat-message-0`, `chat-message-1`, etc. |
| Chat input textarea | `chat-input` |
| Chat send button | `chat-send` |
| Thinking indicator | `coach-thinking` |
| "New message" scroll pill | `new-message-pill` |

**Global:**

| Element | `data-testid` |
|---|---|
| Reset / "New Game" button | `reset-button` |
| Error overlay (server down) | `error-overlay` |
| Toast container | `toast-container` |

### 7.2 Implementation Rule

Components must accept `data-testid` as a prop and forward it to the outermost DOM element:

```typescript
interface AtomProps {
  'data-testid'?: string;
}

function SquareButton({ label, onClick, 'data-testid': testId, ...props }: SquareButtonProps & AtomProps) {
  return (
    <button data-testid={testId} onClick={onClick} {...props}>
      {label}
    </button>
  );
}
```

### 7.3 API Trace Correlation

Every API response includes:

- `X-Request-Id` header (UUID v4) — matches `request_id` in the JSON body
- Backend logs every request with this ID, the endpoint, latency, and any error codes
- The frontend stores the last `request_id` in React state for bug reports

This enables end-to-end tracing: a failing test can report the `request_id`, which maps to a specific backend log entry showing the exact prompt sent to Claude, the Stockfish output, and the heuristics computed.

### 7.4 Test Scenarios (Agent-Executable)

The following scenarios should be automatable by a test agent using only `data-testid` selectors:

1. **Happy path — FEN analysis:**
   - Type FEN into `[data-testid="fen-input"]`
   - Click `[data-testid="submit-button"]`
   - Wait for `[data-testid="loading-state"]` to disappear
   - Assert `[data-testid="chess-board"]` is visible
   - Assert `[data-testid="engine-line-0"]` contains text
   - Assert `[data-testid="chat-message-0"]` contains coach response

2. **Happy path — PGN navigation:**
   - Type PGN into `[data-testid="pgn-input"]`
   - Click `[data-testid="submit-button"]`
   - Wait for analysis view
   - Click `[data-testid="pgn-next"]` three times
   - Assert board position has changed (FEN differs)
   - Click `[data-testid="pgn-start"]`
   - Assert board shows starting position

3. **Error path — Invalid FEN:**
   - Type `"not a valid fen"` into `[data-testid="fen-input"]`
   - Click `[data-testid="submit-button"]`
   - Assert `[data-testid="error-message"]` is visible and contains "Invalid FEN"
   - Assert view is still InputView (board is not visible)

4. **Chat with context:**
   - Complete a FEN analysis (scenario 1)
   - Type question into `[data-testid="chat-input"]`
   - Click `[data-testid="chat-send"]`
   - Assert `[data-testid="coach-thinking"]` appears
   - Wait for `[data-testid="coach-thinking"]` to disappear
   - Assert new `[data-testid="chat-message-*"]` appears with coach response

5. **Move evaluation:**
   - Complete a FEN analysis
   - Drag and drop a piece on `[data-testid="chess-board"]`
   - Assert `[data-testid="coach-thinking"]` appears
   - Wait for response
   - Assert new coach message discusses the move

---

## Appendix A: Key Design Decisions

| Decision | Rationale |
|---|---|
| **REST, not WebSocket** | Engine analysis takes 1-3s, LLM takes 2-5s. Simple loading states are sufficient. WebSocket adds operational complexity (connection management, reconnection, state sync) without proportional UX benefit at v1 scale. |
| **Server-side sessions** | The `Coach` class maintains `conversation_history` in memory. This means the backend is stateful per-session. Acceptable for v1 (single server). Path to v2: serialize `conversation_history` to Redis keyed by `session_id`. |
| **Optimistic board updates** | The board moves instantly on piece drop; coaching arrives asynchronously. This prevents the UI from feeling sluggish. If the backend rejects the move (should be rare since client-side `chess.js` validates first), the board reverts. |
| **No client-side engine** | Stockfish WASM exists but adds 2MB+ to the bundle and complicates the architecture. The backend already has Stockfish running. Keep the client thin. |
| **`chess.js` on the client** | Used only for local move legality checks (instant feedback on piece drops). Not used for analysis. Keeps the board interactive without round-trips for basic validation. |
| **DM Sans + IBM Plex Mono** | Avoids the generic AI-tool aesthetic of Inter/Roboto. DM Sans is geometric and utilitarian. IBM Plex Mono has a technical, industrial character that matches the design philosophy. |
| **No streaming responses** | Claude supports streaming, but the coaching responses are short (1-2 paragraphs, < 200 tokens). Streaming adds frontend complexity (partial renders, markdown parsing mid-stream) for marginal perceived speed improvement. Revisit if response length increases. |

## Appendix B: File Structure (Planned)

```
chess_coach/
├── backend/
│   ├── main.py                  # Existing CLI (retained)
│   ├── server.py                # FastAPI app — new
│   ├── board_state.py           # Existing — no changes
│   ├── engine.py                # Existing — no changes
│   ├── heuristics.py            # Existing — no changes
│   ├── coach.py                 # Existing — minor changes (add prune_history)
│   ├── sessions.py              # Session management — new
│   ├── requirements.txt         # Add: fastapi, uvicorn
│   └── .env                     # Existing
│
├── frontend/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── App.tsx              # State machine (useReducer)
│   │   ├── api.ts               # apiFetch utility + endpoint wrappers
│   │   ├── types.ts             # TypeScript interfaces matching API schemas
│   │   ├── atoms/
│   │   │   ├── MonoText.tsx
│   │   │   ├── SquareButton.tsx
│   │   │   ├── StatusPill.tsx
│   │   │   └── EvalBar.tsx
│   │   ├── molecules/
│   │   │   ├── FenInput.tsx
│   │   │   ├── PgnInput.tsx
│   │   │   ├── MoveCard.tsx
│   │   │   └── ChatBubble.tsx
│   │   ├── organisms/
│   │   │   ├── InputPanel.tsx
│   │   │   ├── BoardPanel.tsx
│   │   │   ├── CoachPanel.tsx
│   │   │   ├── EngineLines.tsx
│   │   │   ├── PgnNavigator.tsx
│   │   │   └── AnalysisLayout.tsx
│   │   └── index.css            # CSS variables, font imports
│   └── public/
│       └── index.html
│
├── ui_spec.md                   # This document
├── backlog.md
├── plan.md
├── user_stories.md
└── README.md
```

## Appendix C: CSS Variable Definitions

```css
:root {
  /* Backgrounds */
  --bg-primary: #0a0a0a;
  --bg-surface: #141414;
  --bg-elevated: #1e1e1e;

  /* Borders */
  --border: #2a2a2a;

  /* Text */
  --text-primary: #e8e8e8;
  --text-secondary: #888888;
  --text-muted: #555555;

  /* Accent */
  --accent: #769656;
  --accent-hover: #8aaa6a;

  /* Semantic */
  --error: #cc4444;
  --warning: #b8860b;

  /* Board */
  --board-light: #eeeed2;
  --board-dark: #769656;

  /* Eval bar */
  --eval-white: #e8e8e8;
  --eval-black: #1a1a1a;

  /* Typography */
  --font-ui: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'Courier New', monospace;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-ui);
  background: var(--bg-primary);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}
```
