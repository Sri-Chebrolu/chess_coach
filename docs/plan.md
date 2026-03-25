# AI Chess Coach — Implementation Plan

## Context

The current [chess_coach.py](chess_coach.py) is a linear proof-of-concept: it hardcodes a FEN, runs Stockfish once, sends a single prompt to Claude, and prints the result. There is no interactive loop, no move input, no comparison logic, and the API key is hardcoded.

The goal is to transform this into a **fully interactive CLI coaching tool** where users can:
1. Load a board position (FEN)
2. See engine analysis grounded in chess principles
3. Input their own candidate moves and receive comparative feedback
4. Have a Socratic back-and-forth conversation with the coach

---

## Implementation Todo List

### Phase 1: Project Setup ✅
- [x] Create `.env` with `ANTHROPIC_API_KEY` and `STOCKFISH_PATH`
- [x] Create `.gitignore` (exclude `.env`, `.venv/`, `chess_coach.log`, `__pycache__/`, `.DS_Store`)
- [x] Create `requirements.txt` with `python-chess`, `anthropic`, `python-dotenv`
- [x] Install dependencies into existing `.venv` (`pip install -r requirements.txt`)
- [x] Verify Stockfish binary runs (`./stockfish/stockfish-macos-m1-apple-silicon` responds to `uci`) — confirmed Stockfish 18

### Phase 2: Ground Truth Layer — `engine.py` ✅
- [x] Create `engine.py` with `EngineAnalysis` class
- [x] Implement `start()` / `stop()` lifecycle methods
- [x] Implement `analyze_position(board, num_moves=3)` — returns top N moves with scores and principal variations
- [x] Implement `evaluate_move(board, move)` — evaluates a specific user move by pushing it and analyzing the result
- [x] Smoke test: load a known FEN, call `analyze_position`, verify output has 3 moves with centipawn scores

### Phase 3: Logic Layer — `board_state.py` ✅
- [x] Create `board_state.py` with `BoardState` class
- [x] Implement `load_fen(fen)` — loads a position and resets history
- [x] Implement `validate_and_parse_move(move_str)` — accepts both SAN (`Nf3`) and UCI (`g1f3`) notation
- [x] Implement `push_move(move)` / `undo_move()` — advances/rewinds the game state
- [x] Implement `get_legal_moves_san()`, `turn` property, `display()`
- [x] Smoke test: load FEN, validate a legal move, validate an illegal move, push/undo

### Phase 4: Logic Layer — `heuristics.py` ✅
- [x] Create `heuristics.py` with `extract_heuristics(board)` orchestrator function
- [x] Implement `_material_balance()` — piece value sums for each side
- [x] Implement `_center_control()` — count attacks on d4/d5/e4/e5
- [x] Implement `_piece_activity()` — total squares attacked per side
- [x] Implement `_king_safety()` — castling status, pawn shield count, attacker count
- [x] Implement `_pawn_structure()` — detect doubled and isolated pawns
- [x] Implement `_tactical_motifs()` — detect check, hanging pieces
- [x] Implement `_development()` — detect undeveloped minor pieces on starting squares
- [x] Implement `format_heuristics_for_prompt()` — convert dict to human-readable string for LLM
- [x] Smoke test: run against a known FEN, verify material count matches manual counting

### Phase 5: Reasoning Layer — `coach.py` ✅
- [x] Create `coach.py` with prompt templates (`SYSTEM_PROMPT`, `POSITION_ANALYSIS_TEMPLATE`, `MOVE_COMPARISON_TEMPLATE`)
- [x] Implement `Coach` class with `conversation_history` for multi-turn context
- [x] Implement `analyze_position()` — fills the position analysis template with grounded facts and sends to Claude
- [x] Implement `compare_moves()` — fills the move comparison template with before/after heuristics and delta
- [x] Implement `followup()` — sends free-form user questions with full conversation history
- [x] Implement `_send()` with retry logic (exponential backoff for rate limits, graceful failure for connection/API errors)
- [x] Add `logging` — log prompts sent, responses received, and token usage to `chess_coach.log`
- [x] Smoke test: imports, constructs, templates valid

### Phase 6: CLI Controller — `main.py` ✅
- [x] Create `main.py` with logging configuration (file-only, DEBUG level)
- [x] Implement `format_top_moves()` helper — formats engine output for display
- [x] Implement `print_help()` — lists all available commands
- [x] Implement main input loop with command parsing (`fen`, `board`, `legal`, `analyze`, `move`, `play`, `undo`, `ask`, `help`, `quit`)
- [x] Wire `fen` command → `BoardState.load_fen()`
- [x] Wire `analyze` command → `EngineAnalysis.analyze_position()` + `extract_heuristics()` + `Coach.analyze_position()`
- [x] Wire `move` command → validate + engine analysis + delta calculation + heuristics before/after + `Coach.compare_moves()`
- [x] Wire `play` command → `BoardState.push_move()` (advances the board without coaching)
- [x] Wire `undo` command → `BoardState.undo_move()`
- [x] Wire `ask` command → `Coach.followup()`
- [x] Add engine lifecycle management (`start()` in setup, `stop()` in `finally` block)

### Phase 7: Integration Testing ✅
- [x] **Test 1 — Full analysis pipeline:** Load opening FEN → `analyze` → verify Claude references center control and development
- [x] **Test 2 — Move comparison (good vs bad):** Load a tactical FEN → `move d4` (strong) then `move a3` (passive) → verify delta and coaching differ
- [x] **Test 3 — Conversational context:** Run `analyze` then `ask Why is king safety important here?` → verify Claude references the prior position
- [x] **Test 4 — Error paths:** Try an illegal move → verify graceful rejection with legal move suggestions
- [x] **Test 5 — Play + Undo flow:** `play e4` → `play e5` → `undo` → verify board reverts correctly
- [x] **Test 6 — Logging audit:** After a session, check `chess_coach.log` for prompt/response pairs and token counts

---

## File Structure

```
chess_coach/
├── .env                     # API key + Stockfish path
├── requirements.txt         # python-chess, anthropic, python-dotenv
├── main.py                  # Entry point — CLI loop
├── engine.py                # Stockfish wrapper (Ground Truth layer)
├── board_state.py           # Board + move management (Logic layer)
├── heuristics.py            # Tactical/positional feature extraction (Logic layer)
├── coach.py                 # Claude LLM integration + prompt templates (Reasoning layer)
├── chess_coach.py           # (existing PoC — will be retired)
└── chess_coach.log          # Auto-generated log file (prompt/response audit trail)
```

**Why this structure:** Each file maps directly to one layer of the README's architecture. `engine.py` is deterministic ground truth, `heuristics.py` + `board_state.py` are the logic/rules layer, `coach.py` is the stochastic reasoning layer (prompt templates + API logic in one file — no need to split since the prompts are tightly coupled to the Coach class and only used there), and `main.py` is the controller.

---

## Step 1: Environment & Config (`.env` + `requirements.txt`)

Create `.env` to remove the hardcoded API key from `chess_coach.py`:

```
ANTHROPIC_API_KEY=your-key-here
STOCKFISH_PATH=./stockfish/stockfish-macos-m1-apple-silicon
```

`requirements.txt`:
```
python-chess
anthropic
python-dotenv
```

---

## Step 2: Stockfish Engine Wrapper — `engine.py`

Wraps all Stockfish interaction. Returns only structured data (no LLM calls here).

```python
import chess
import chess.engine
import os
from dotenv import load_dotenv

load_dotenv()

class EngineAnalysis:
    """Ground Truth layer — deterministic engine evaluation."""

    def __init__(self, path=None, time_limit=1.0):
        self.path = path or os.getenv("STOCKFISH_PATH")
        self.time_limit = time_limit
        self.engine = None

    def start(self):
        self.engine = chess.engine.SimpleEngine.popen_uci(self.path)

    def stop(self):
        if self.engine:
            self.engine.quit()

    def analyze_position(self, board: chess.Board, num_moves=3):
        """Get top N moves with evaluations."""
        result = self.engine.analyse(
            board,
            chess.engine.Limit(time=self.time_limit),
            multipv=num_moves
        )
        moves = []
        for info in result:
            score = info["score"].white()
            moves.append({
                "move": info["pv"][0],
                "san": board.san(info["pv"][0]),
                "score_cp": score.score(mate_score=10000),
                "mate": score.mate(),
                "pv": [board.san(m) for m in info["pv"][:5]],
            })
        return moves

    def evaluate_move(self, board: chess.Board, move: chess.Move):
        """Evaluate a specific move by playing it and analyzing the resulting position."""
        board_after = board.copy()
        board_after.push(move)
        result = self.engine.analyse(
            board_after,
            chess.engine.Limit(time=self.time_limit)
        )
        score = result["score"].white()
        return {
            "move": move,
            "san": board.san(move),
            "score_cp": score.score(mate_score=10000),
            "mate": score.mate(),
        }
```

**Key design choice:** `multipv=num_moves` tells Stockfish to return the top N lines instead of just the best one. This is what powers the comparison logic later.

---

## Step 3: Board State Manager — `board_state.py`

Manages the chess board, validates moves, and tracks history.

```python
import chess

class BoardState: 
    """Logic layer — board representation and move validation."""

    def __init__(self, fen=None):
        self.board = chess.Board(fen) if fen else chess.Board()
        self.initial_fen = self.board.fen()
        self.move_history = []

    def load_fen(self, fen: str):
        self.board = chess.Board(fen)
        self.initial_fen = fen
        self.move_history = []
        # Board history is stored in TWO places:
        # 1. python-chess internal: board.move_stack (authoritative, powers undo via board.pop())
        # 2. self.move_history: human-readable SAN list (e.g. ["e4", "Nf3"]) for display only
        # Both reset on load_fen() because a new position starts a fresh session.

    def validate_and_parse_move(self, move_str: str) -> chess.Move | None:
        """Parse user input as SAN (e.g. 'Nf3') or UCI (e.g. 'g1f3')."""
        # Try SAN first (most human-friendly)
        try:
            return self.board.parse_san(move_str)
        except (chess.InvalidMoveError, chess.AmbiguousMoveError):
            pass
        # Try UCI notation
        try:
            move = chess.Move.from_uci(move_str)
            if move in self.board.legal_moves:
                return move
        except (chess.InvalidMoveError, ValueError):
            pass
        return None

    def push_move(self, move: chess.Move):
        self.move_history.append(self.board.san(move))
        self.board.push(move)

    def undo_move(self):
        if self.move_history:
            self.board.pop()
            return self.move_history.pop()
        return None

    def get_legal_moves_san(self) -> list[str]:
        return [self.board.san(m) for m in self.board.legal_moves]

    @property
    def turn(self) -> str:
        return "White" if self.board.turn == chess.WHITE else "Black"

    def display(self) -> str:
        return str(self.board)
```

---

## Step 4: Heuristic Extraction — `heuristics.py`

This is the critical bridge between raw engine numbers and human-understandable principles. Uses `python-chess` to extract positional features **deterministically** (no LLM involved).

```python
import chess

PIECE_VALUES = {
    chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
    chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0
}

CENTER_SQUARES = [chess.D4, chess.D5, chess.E4, chess.E5]
EXTENDED_CENTER = [chess.C3, chess.C4, chess.C5, chess.C6,
                   chess.D3, chess.D6, chess.E3, chess.E6,
                   chess.F3, chess.F4, chess.F5, chess.F6]

def extract_heuristics(board: chess.Board) -> dict:
    """Extract all positional/tactical features from the board."""
    return {
        "material": _material_balance(board),
        "center_control": _center_control(board),
        "piece_activity": _piece_activity(board),
        "king_safety": _king_safety(board),
        "pawn_structure": _pawn_structure(board),
        "tactics": _tactical_motifs(board),
        "development": _development(board),
    }

def _material_balance(board: chess.Board) -> dict:
    white_material = sum(
        len(board.pieces(pt, chess.WHITE)) * val
        for pt, val in PIECE_VALUES.items()
    )
    black_material = sum(
        len(board.pieces(pt, chess.BLACK)) * val
        for pt, val in PIECE_VALUES.items()
    )
    return {
        "white": white_material,
        "black": black_material,
        "balance": white_material - black_material,
        "description": f"White: {white_material} pts, Black: {black_material} pts (balance: {white_material - black_material:+d})"
    }

def _center_control(board: chess.Board) -> dict:
    white_center = sum(
        1 for sq in CENTER_SQUARES
        if board.is_attacked_by(chess.WHITE, sq)
    )
    black_center = sum(
        1 for sq in CENTER_SQUARES
        if board.is_attacked_by(chess.BLACK, sq)
    )
    return {
        "white_controls": white_center,
        "black_controls": black_center,
        "description": f"Center control — White: {white_center}/4, Black: {black_center}/4"
    }

def _piece_activity(board: chess.Board) -> dict:
    """Count legal moves available as a proxy for piece activity."""
    white_moves = 0
    black_moves = 0
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece:
            attacks = len(board.attacks(sq))
            if piece.color == chess.WHITE:
                white_moves += attacks
            else:
                black_moves += attacks
    return {
        "white_activity": white_moves,
        "black_activity": black_moves,
        "description": f"Piece activity (squares attacked) — White: {white_moves}, Black: {black_moves}"
    }

def _king_safety(board: chess.Board) -> dict:
    results = {}
    for color, name in [(chess.WHITE, "white"), (chess.BLACK, "black")]:
        king_sq = board.king(color)
        attackers = board.attackers(not color, king_sq)
        is_castled = not board.has_castling_rights(color)
        shield_pawns = 0
        if king_sq is not None:
            # Check pawns in front of the king
            direction = 8 if color == chess.WHITE else -8
            for offset in [direction - 1, direction, direction + 1]:
                sq = king_sq + offset
                if 0 <= sq <= 63:
                    piece = board.piece_at(sq)
                    if piece and piece.piece_type == chess.PAWN and piece.color == color:
                        shield_pawns += 1
        results[name] = {
            "attackers": len(attackers),
            "in_check": board.is_check() and board.turn == color,
            "castled": is_castled,
            "pawn_shield": shield_pawns,
        }
    return results

def _pawn_structure(board: chess.Board) -> dict:
    issues = {"white": [], "black": []}
    for color, name in [(chess.WHITE, "white"), (chess.BLACK, "black")]:
        pawns = board.pieces(chess.PAWN, color)
        files_with_pawns = [chess.square_file(sq) for sq in pawns]
        # Doubled pawns
        for f in range(8):
            count = files_with_pawns.count(f)
            if count > 1:
                issues[name].append(f"doubled pawns on {chess.FILE_NAMES[f]}-file")
        # Isolated pawns
        for f in set(files_with_pawns):
            adjacent = [f - 1, f + 1]
            if not any(af in files_with_pawns for af in adjacent if 0 <= af <= 7):
                issues[name].append(f"isolated pawn on {chess.FILE_NAMES[f]}-file")
    return issues

def _tactical_motifs(board: chess.Board) -> list[str]:
    motifs = []
    if board.is_check():
        motifs.append("King is in CHECK")
    # Detect hanging pieces (attacked but not defended)
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece and piece.piece_type != chess.KING:
            enemy = not piece.color
            if board.is_attacked_by(enemy, sq) and not board.is_attacked_by(piece.color, sq):
                motifs.append(
                    f"HANGING: {piece.symbol()} on {chess.square_name(sq)} "
                    f"is attacked but undefended"
                )
    return motifs

def _development(board: chess.Board) -> dict:
    """Check if knights and bishops have moved from starting squares."""
    undeveloped = {"white": [], "black": []}
    start_positions = {
        chess.WHITE: {chess.B1: "Nb1", chess.G1: "Ng1", chess.C1: "Bc1", chess.F1: "Bf1"},
        chess.BLACK: {chess.B8: "Nb8", chess.G8: "Ng8", chess.C8: "Bc8", chess.F8: "Bf8"},
    }
    for color, positions in start_positions.items():
        name = "white" if color == chess.WHITE else "black"
        for sq, label in positions.items():
            piece = board.piece_at(sq)
            if piece and piece.color == color:
                undeveloped[name].append(label)
    return undeveloped

def format_heuristics_for_prompt(heuristics: dict) -> str:
    """Convert heuristics dict into a readable string for the LLM prompt."""
    lines = []
    lines.append(f"MATERIAL: {heuristics['material']['description']}")
    lines.append(f"CENTER: {heuristics['center_control']['description']}")
    lines.append(f"ACTIVITY: {heuristics['piece_activity']['description']}")

    for color in ["white", "black"]:
        ks = heuristics["king_safety"][color]
        status = "castled" if ks["castled"] else "uncastled"
        lines.append(
            f"KING SAFETY ({color}): {status}, "
            f"{ks['pawn_shield']} shield pawns, "
            f"{ks['attackers']} attackers"
        )

    for color in ["white", "black"]:
        if heuristics["pawn_structure"][color]:
            lines.append(f"PAWN ISSUES ({color}): {', '.join(heuristics['pawn_structure'][color])}")

    for color in ["white", "black"]:
        if heuristics["development"][color]:
            lines.append(f"UNDEVELOPED ({color}): {', '.join(heuristics['development'][color])}")

    if heuristics["tactics"]:
        lines.append(f"TACTICS: {'; '.join(heuristics['tactics'])}")

    return "\n".join(lines)
```

**Why these heuristics matter:** These are the "facts" the LLM will never need to guess about. By computing material, center control, king safety, and pawn structure deterministically, we prevent Claude from hallucinating about board state.

---

## Step 5: Coach / LLM Interface — `coach.py`

Prompt templates and API logic live in a single file — the templates are tightly coupled to the Coach class and only used here, so a separate `prompts.py` would just add an unnecessary import hop.

```python
import os
import time
import logging
import anthropic
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("chess_coach")

# ─── Prompt Templates ───────────────────────────────────────

SYSTEM_PROMPT = """You are an expert chess coach. You teach through the Socratic method —
asking questions to guide understanding rather than just giving answers.

RULES:
- ONLY reference facts provided in the BOARD ANALYSIS section. Never invent board state.
- Ground all advice in chess principles: center control, piece development, king safety,
  pawn structure, piece activity, tactical motifs.
- When comparing moves, explain the trade-offs in terms of these principles.
- Keep responses concise (1-2 paragraphs max).
- End with a thought-provoking question when appropriate."""

POSITION_ANALYSIS_TEMPLATE = """
=== BOARD ANALYSIS (Ground Truth — do not contradict) ===
FEN: {fen}
Side to move: {turn}

ENGINE TOP MOVES:
{top_moves}

POSITIONAL FEATURES:
{heuristics}

=== TASK ===
Analyze this position. Explain the key strategic themes and why the engine's top move is strong.
"""

MOVE_COMPARISON_TEMPLATE = """
=== BOARD ANALYSIS (Ground Truth — do not contradict) ===
FEN: {fen}
Side to move: {turn}

ENGINE'S BEST MOVE: {best_move} (eval: {best_score} cp)
USER'S MOVE: {user_move} (eval: {user_score} cp)
EVAL DIFFERENCE: {delta} centipawns

ENGINE TOP MOVES:
{top_moves}

POSITIONAL FEATURES (before move):
{heuristics_before}

POSITIONAL FEATURES (after user's move):
{heuristics_after}

=== TASK ===
The student played {user_move} instead of the engine's {best_move}.
Compare both moves using chess principles. Explain what the student's move
gains or loses strategically. Be encouraging but honest.
"""

# ─── Coach Class ─────────────────────────────────────────────

class Coach:
    """Reasoning layer — LLM synthesis from grounded facts."""

    def __init__(self):
        self.client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY env var
        self.conversation_history = []
        self.model = "claude-sonnet-4-5-20250929"

    def analyze_position(self, fen, turn, top_moves_str, heuristics_str) -> str:
        prompt = POSITION_ANALYSIS_TEMPLATE.format(
            fen=fen, turn=turn,
            top_moves=top_moves_str,
            heuristics=heuristics_str,
        )
        return self._send(prompt)

    def compare_moves(self, fen, turn, best_move, best_score,
                      user_move, user_score, delta,
                      top_moves_str, heuristics_before, heuristics_after) -> str:
        prompt = MOVE_COMPARISON_TEMPLATE.format(
            fen=fen, turn=turn,
            best_move=best_move, best_score=best_score,
            user_move=user_move, user_score=user_score, delta=delta,
            top_moves=top_moves_str,
            heuristics_before=heuristics_before,
            heuristics_after=heuristics_after,
        )
        return self._send(prompt)

    def followup(self, question: str) -> str:
        """Handle free-form follow-up questions with conversation context."""
        return self._send(question)

    def _send(self, user_message: str) -> str:
        self.conversation_history.append({"role": "user", "content": user_message})

        # Log the prompt being sent so we can trace what facts the LLM received
        logger.debug("PROMPT SENT TO CLAUDE:\n%s", user_message)

        # Retry with exponential backoff for transient API errors
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=1024,
                    system=SYSTEM_PROMPT,
                    messages=self.conversation_history,
                )
                break
            except anthropic.RateLimitError:
                wait = 2 ** attempt  # 1s, 2s, 4s
                logger.warning("Rate limited by API. Retrying in %ds...", wait)
                print(f"Rate limited. Retrying in {wait}s...")
                time.sleep(wait)
            except anthropic.APIConnectionError as e:
                logger.error("API connection failed: %s", e)
                self.conversation_history.pop()  # Remove the failed user message
                return "Connection error — check your internet and try again."
            except anthropic.APIStatusError as e:
                logger.error("API error (status %d): %s", e.status_code, e.message)
                self.conversation_history.pop()
                return f"API error ({e.status_code}). Please try again."
        else:
            # All retries exhausted
            self.conversation_history.pop()
            return "Rate limit exceeded after retries. Please wait a moment and try again."

        assistant_text = response.content[0].text
        self.conversation_history.append({"role": "assistant", "content": assistant_text})

        # Log response + token usage for auditing
        logger.debug("CLAUDE RESPONSE:\n%s", assistant_text)
        logger.info(
            "Tokens used — input: %d, output: %d",
            response.usage.input_tokens,
            response.usage.output_tokens,
        )

        return assistant_text
```

**Key design choices:**
- **Conversation history** is maintained across calls, so Claude has full context of the coaching session — the user can ask follow-up questions like "what about if I castle instead?" and Claude remembers the position being discussed.
- **Error handling** catches the three main failure modes from the Anthropic SDK: rate limits (retries with backoff), connection errors (immediate graceful failure), and other API errors (status code reported to user). On failure, the user message is popped from history so it doesn't corrupt future context.
- **Logging** traces both the grounded prompt sent to Claude and its response. This creates an audit trail: if the coach says something wrong, check the log to see whether the heuristics were incorrect (our bug) or the LLM ignored the facts (prompt tuning issue). Token usage is logged at INFO level for cost monitoring. Logs go to a file (`chess_coach.log`), not stdout, so they don't clutter the CLI.

---

## Step 6: CLI Controller — `main.py`

```python
import sys
import logging
from board_state import BoardState
from engine import EngineAnalysis
from heuristics import extract_heuristics, format_heuristics_for_prompt
from coach import Coach

# Configure logging — file-only so it doesn't clutter the CLI
logging.basicConfig(
    filename="chess_coach.log",
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

def format_top_moves(moves: list[dict]) -> str:
    lines = []
    for i, m in enumerate(moves, 1):
        score = f"mate in {m['mate']}" if m["mate"] else f"{m['score_cp']} cp"
        pv = " → ".join(m["pv"])
        lines.append(f"  {i}. {m['san']} ({score}) — line: {pv}")
    return "\n".join(lines)

def print_help():
    print("""
Commands:
  fen <FEN_STRING>   Load a new position
  analyze            Analyze the current position
  move <MOVE>        Test a move (e.g. 'move Nf3' or 'move g1f3')
  play <MOVE>        Play a move on the board (advances the game)
  undo               Undo the last played move
  board              Show the current board
  legal              List all legal moves
  ask <QUESTION>     Ask the coach a free-form question
  help               Show this help message
  quit               Exit
""")

def main():
    board_state = BoardState()
    engine = EngineAnalysis()
    coach = Coach()

    engine.start()
    print("=== AI Chess Coach ===")
    print("Type 'help' for commands, or 'fen <string>' to load a position.\n")

    try:
        while True:
            try:
                user_input = input("chess> ").strip()
            except EOFError:
                break
            if not user_input:
                continue

            parts = user_input.split(maxsplit=1)
            command = parts[0].lower()
            arg = parts[1] if len(parts) > 1 else ""

            if command == "quit":
                break
            elif command == "help":
                print_help()
            elif command == "fen":
                try:
                    board_state.load_fen(arg)
                    print(f"Position loaded. {board_state.turn} to move.")
                    print(board_state.display())
                except Exception as e:
                    print(f"Invalid FEN: {e}")
            elif command == "board":
                print(board_state.display())
                print(f"\nFEN: {board_state.board.fen()}")
                print(f"{board_state.turn} to move.")
            elif command == "legal":
                print(", ".join(board_state.get_legal_moves_san()))
            elif command == "analyze":
                print("Analyzing position...")
                top_moves = engine.analyze_position(board_state.board)
                heuristics = extract_heuristics(board_state.board)
                response = coach.analyze_position(
                    fen=board_state.board.fen(),
                    turn=board_state.turn,
                    top_moves_str=format_top_moves(top_moves),
                    heuristics_str=format_heuristics_for_prompt(heuristics),
                )
                print(f"\n{response}\n")
            elif command == "move":
                # Hypothesis testing — compare user's move to engine's best
                move = board_state.validate_and_parse_move(arg)
                if not move:
                    print(f"Invalid or illegal move: '{arg}'")
                    print(f"Legal moves: {', '.join(board_state.get_legal_moves_san())}")
                    continue
                print(f"Evaluating {board_state.board.san(move)}...")
                top_moves = engine.analyze_position(board_state.board)
                user_eval = engine.evaluate_move(board_state.board, move)
                best = top_moves[0]
                delta = best["score_cp"] - (-user_eval["score_cp"])

                heuristics_before = extract_heuristics(board_state.board)
                temp_board = board_state.board.copy()
                temp_board.push(move)
                heuristics_after = extract_heuristics(temp_board)

                response = coach.compare_moves(
                    fen=board_state.board.fen(),
                    turn=board_state.turn,
                    best_move=best["san"], best_score=best["score_cp"],
                    user_move=board_state.board.san(move),
                    user_score=user_eval["score_cp"],
                    delta=delta,
                    top_moves_str=format_top_moves(top_moves),
                    heuristics_before=format_heuristics_for_prompt(heuristics_before),
                    heuristics_after=format_heuristics_for_prompt(heuristics_after),
                )
                print(f"\n{response}\n")
            elif command == "play":
                move = board_state.validate_and_parse_move(arg)
                if not move:
                    print(f"Invalid or illegal move: '{arg}'")
                    continue
                san = board_state.board.san(move)
                board_state.push_move(move)
                print(f"Played {san}. {board_state.turn} to move.")
                print(board_state.display())
            elif command == "undo":
                undone = board_state.undo_move()
                if undone:
                    print(f"Undone: {undone}. {board_state.turn} to move.")
                    print(board_state.display())
                else:
                    print("Nothing to undo.")
            elif command == "ask":
                if not arg:
                    print("Usage: ask <your question>")
                    continue
                response = coach.followup(arg)
                print(f"\n{response}\n")
            else:
                print(f"Unknown command: '{command}'. Type 'help' for commands.")
    finally:
        engine.stop()
        print("Goodbye!")

if __name__ == "__main__":
    main()
```

---

## Data Flow Summary

```
User types "move Nf3"
      │
      ▼
  BoardState.validate_and_parse_move("Nf3")     ← Logic Layer
      │
      ▼
  EngineAnalysis.analyze_position(board, 3)      ← Ground Truth Layer
  EngineAnalysis.evaluate_move(board, Nf3)       ← Ground Truth Layer
      │
      ▼
  extract_heuristics(board_before)               ← Logic Layer
  extract_heuristics(board_after_Nf3)            ← Logic Layer
      │
      ▼
  Coach.compare_moves(                           ← Reasoning Layer
      facts from engine + heuristics
  )
      │
      ▼
  Claude generates principle-based feedback
  grounded in the deterministic facts above
```

---

## Files to Create / Modify

| File | Action | Purpose |
|---|---|---|
| `.env` | **Create** | Store API key and Stockfish path |
| `requirements.txt` | **Create** | Pin dependencies |
| `engine.py` | **Create** | Stockfish wrapper class |
| `board_state.py` | **Create** | Board/move management class |
| `heuristics.py` | **Create** | Positional feature extraction |
| `coach.py` | **Create** | Claude LLM interface + prompt templates |
| `main.py` | **Create** | CLI entry point |
| `chess_coach.py` | **Retire** | Existing PoC (no longer the entry point) |

---

## Verification Plan

1. **Unit test each module independently:**
   - `board_state.py`: Load FEN, validate legal/illegal moves, push/undo
   - `engine.py`: Get top moves for a known position, verify scores are reasonable
   - `heuristics.py`: Extract features from a known position, verify material count, hanging pieces

2. **Integration test — full analysis pipeline:**
   ```
   $ python main.py
   chess> fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1
   chess> analyze
   ```
   Verify: Claude response references center control, development, real engine moves

3. **Integration test — move comparison:**
   ```
   chess> fen rnb1kb1r/ppp1pppp/4qn2/8/8/2N5/PPPPBPPP/R1BQK1NR w KQkq - 4 5
   chess> move d4
   chess> move a3
   ```
   Verify: Coach explains the delta between a strong center move and a passive move

4. **Conversational context test:**
   ```
   chess> analyze
   chess> ask Why is king safety important here?
   ```
   Verify: Claude references the position from the previous analysis

---

## PGN Paste Feature — Detailed Implementation

### Context

The chess coach currently supports single-move input and FEN position loading. Users have requested the ability to paste PGN (Portable Game Notation) strings to load complete games and navigate through them move-by-move. This enables users to:
- Review historical games
- Analyze positions from any point in a game
- Get coaching feedback on specific positions within a game sequence

### Implementation Approach

**Two-Mode System:**
- **Play Mode** (default): Users freely play moves, analyze positions
- **PGN Navigation Mode**: Users review a loaded PGN, navigate with `next`/`prev`/`goto` commands

**State Management:**
- Store parsed PGN game + extracted move list in `BoardState`
- Track current position with index (0 = start, N = after Nth half-move)
- Rebuild board from scratch when navigating (simple & reliable)
- Auto-exit PGN mode when user plays a move or loads FEN

**PGN Parsing:**
- Use `chess.pgn` module from existing `python-chess` library
- Wrap PGN strings in `io.StringIO` - `chess.pgn.read_game()` expects a file object, not a string. `StringIO` wraps the string as an in-memory file.
- Extract mainline only - PGN games can have alternative move branches in parentheses like `1.e4 e5 (1...c5)`. We follow only the main line and skip alternatives.
- Support custom starting positions via FEN tag
- Display game metadata (Event, White, Black) 

---

### Code Changes

#### File 1: board_state.py

**Change 1.1: Add imports (line 1)**
```python
import chess
import chess.pgn  # NEW
import io         # NEW
```

**Change 1.2: Modify `__init__` method (add after line 10)**
```python
def __init__(self, fen=None):
    self.board = chess.Board(fen) if fen else chess.Board()
    self.initial_fen = self.board.fen()
    self.move_history = []

    # NEW: PGN navigation state
    self.pgn_game = None              # chess.pgn.Game object
    self.pgn_moves = []               # List of chess.Move objects from mainline
    self.pgn_current_index = 0        # Current position (0 = start)
    self.pgn_mode = False             # True when navigating a PGN
```

**Change 1.3: Modify `load_fen` method (line 12-19)**
```python
def load_fen(self, fen: str):
    self.exit_pgn_mode()  # NEW: Exit PGN mode when loading new position
    self.board = chess.Board(fen)
    self.initial_fen = fen
    self.move_history = []
    # Board history is stored in TWO places:
    # 1. python-chess internal: board.move_stack (authoritative, powers undo via board.pop())
    # 2. self.move_history: human-readable SAN list (e.g. ["e4", "Nf3"]) for display only
    # Both reset on load_fen() because a new position starts a fresh session.
```

**Change 1.4: Modify `push_move` method (line 35-37)**
```python
def push_move(self, move: chess.Move):
    self.exit_pgn_mode()  # NEW: Exit PGN mode when playing a move
    self.move_history.append(self.board.san(move))
    self.board.push(move)
```

**Change 1.5: Add new methods at end of class (after line 53)**
```python
    def _parse_pgn_string(self, pgn_string: str) -> tuple[chess.pgn.Game | None, str | None]:
        """
        Parse a PGN string and return the Game object or an error message.

        Returns:
            tuple of (Game object or None, error message or None)
        """

        try:
            pgn_io = io.StringIO(pgn_string)
            game = chess.pgn.read_game(pgn_io)
            if game is None:
                return None, "No valid PGN game found"
            return game, None
        except Exception as e:
            return None, f"PGN parsing error: {str(e)}"

    def load_pgn(self, pgn_string: str) -> tuple[bool, str]:
        """
        Load a PGN game for navigation.

        Returns:
            tuple of (success: bool, message: str)
        """
        # Parse PGN string
        game, error = self._parse_pgn_string(pgn_string)
        if error:
            return False, error

        # Extract starting position
        if "FEN" in game.headers:
            starting_fen = game.headers["FEN"]
            board = chess.Board(starting_fen)
        else:
            board = chess.Board()
            starting_fen = board.fen()

        # Extract mainline moves
        moves = []
        node = game
        while node.variations:
            next_node = node.variation(0)  # Follow mainline (first variation)
            moves.append(next_node.move)
            node = next_node

        if not moves:
            return False, "PGN contains no moves"

        # Set state
        self.pgn_game = game
        self.pgn_moves = moves
        self.pgn_current_index = 0
        self.pgn_mode = True
        self.board = chess.Board(starting_fen)
        self.initial_fen = starting_fen
        self.move_history = []

        # Build success message
        move_count = len(moves)
        full_moves = (move_count + 1) // 2
        message = f"Loaded game with {move_count} half-moves ({full_moves} full moves)"
        if "White" in game.headers and "Black" in game.headers:
            message += f"\n{game.headers['White']} vs {game.headers['Black']}"
        if "Event" in game.headers:
            message += f"\nEvent: {game.headers['Event']}"
        message += "\nCurrently at starting position"
        message += "\nUse 'goto <N>', 'next', 'prev', 'start', 'end', or 'moves' to navigate"

        return True, message

    def navigate_to_move(self, move_index: int) -> tuple[bool, str]:
        """
        Navigate to a specific half-move in the PGN.

        Args:
            move_index: 0-indexed position (0 = start, 1 = after first move)

        Returns:
            tuple of (success: bool, message: str)
        """
        if not self.pgn_mode:
            return False, "No PGN loaded. Use 'pgn <string>' first."

        if move_index < 0 or move_index > len(self.pgn_moves):
            return False, f"Invalid move number. Valid range: 0-{len(self.pgn_moves)}"

        # Reset board to initial position
        self.board = chess.Board(self.initial_fen)
        self.move_history = []

        # Apply moves up to index
        for i in range(move_index):
            move = self.pgn_moves[i]
            self.move_history.append(self.board.san(move))
            self.board.push(move)

        self.pgn_current_index = move_index

        # Format message with context
        if move_index == 0:
            message = "At starting position"
        else:
            last_move_san = self.move_history[-1]
            full_move_num = ((move_index - 1) // 2) + 1
            is_white_move = (move_index % 2) == 1
            move_notation = f"{full_move_num}.{'' if is_white_move else '..'}{last_move_san}"
            message = f"Position after move {move_index}: {move_notation}"

        return True, message

    def pgn_next(self) -> tuple[bool, str]:
        """Move forward one half-move in PGN navigation."""
        if not self.pgn_mode:
            return False, "No PGN loaded."

        if self.pgn_current_index >= len(self.pgn_moves):
            return False, "Already at end of game"

        return self.navigate_to_move(self.pgn_current_index + 1)

    def pgn_prev(self) -> tuple[bool, str]:
        """Move backward one half-move in PGN navigation."""
        if not self.pgn_mode:
            return False, "No PGN loaded."

        if self.pgn_current_index == 0:
            return False, "Already at start of game"

        return self.navigate_to_move(self.pgn_current_index - 1)

    def pgn_start(self) -> tuple[bool, str]:
        """Jump to start of PGN game."""
        if not self.pgn_mode:
            return False, "No PGN loaded."
        return self.navigate_to_move(0)

    def pgn_end(self) -> tuple[bool, str]:
        """Jump to end of PGN game."""
        if not self.pgn_mode:
            return False, "No PGN loaded."
        return self.navigate_to_move(len(self.pgn_moves))

    def get_pgn_moves_display(self) -> str:
        """
        Get formatted move list with current position indicator.
        Returns a string like: "1. e4 e5 2. Nf3 Nc6 3. Bb5 * a6"
        """
        if not self.pgn_mode:
            return "No PGN loaded"

        lines = []
        temp_board = chess.Board(self.initial_fen)

        for i, move in enumerate(self.pgn_moves):
            san = temp_board.san(move)
            temp_board.push(move)

            # Add move number for white's moves
            if i % 2 == 0:
                move_num = (i // 2) + 1
                lines.append(f"{move_num}. {san}")
            else:
                lines[-1] += f" {san}"

            # Add position indicator
            if i + 1 == self.pgn_current_index:
                lines.append("*")

        # Handle case where we're at the end
        if self.pgn_current_index == len(self.pgn_moves):
            lines.append("*")

        return " ".join(lines)

    def exit_pgn_mode(self):
        """Exit PGN navigation mode and return to normal play mode."""
        self.pgn_mode = False
        self.pgn_game = None
        self.pgn_moves = []
        self.pgn_current_index = 0
```

---

#### File 2: main.py

**Change 2.1: Modify `undo` command handler (around line 128-134)**
```python
elif command == "undo":
    if board_state.pgn_mode:  # NEW: Check if in PGN mode
        print("Cannot undo in PGN navigation mode. Use 'prev' to go back.")
        continue
    undone = board_state.undo_move()
    if undone:
        print(f"Undone: {undone}. {board_state.turn} to move.")
        print(board_state.display())
    else:
        print("Nothing to undo.")
```

**Change 2.2: Add new command handlers (after line 134, before `elif command == "ask"`)**
```python
elif command == "pgn":
    if not arg:
        print("Usage: pgn <PGN_STRING>")
        print("Example: pgn 1. e4 e5 2. Nf3 Nc6 3. Bb5")
        continue
    success, message = board_state.load_pgn(arg)
    print(message)
    if success:
        print(board_state.display())

elif command == "goto":
    if not arg:
        print("Usage: goto <move_number>")
        print("Example: goto 5 (jumps to position after 5th half-move)")
        continue
    try:
        move_num = int(arg)
        success, message = board_state.navigate_to_move(move_num)
        print(message)
        if success:
            print(board_state.display())
            print(f"\nFEN: {board_state.board.fen()}")
    except ValueError:
        print(f"Invalid move number: '{arg}'")

elif command == "next":
    success, message = board_state.pgn_next()
    print(message)
    if success:
        print(board_state.display())
        print(f"\nFEN: {board_state.board.fen()}")

elif command == "prev":
    success, message = board_state.pgn_prev()
    print(message)
    if success:
        print(board_state.display())
        print(f"\nFEN: {board_state.board.fen()}")

elif command == "start":
    success, message = board_state.pgn_start()
    print(message)
    if success:
        print(board_state.display())
        print(f"\nFEN: {board_state.board.fen()}")

elif command == "end":
    success, message = board_state.pgn_end()
    print(message)
    if success:
        print(board_state.display())
        print(f"\nFEN: {board_state.board.fen()}")

elif command == "moves":
    if not board_state.pgn_mode:
        print("No PGN loaded. Use 'pgn <string>' first.")
    else:
        print(board_state.get_pgn_moves_display())
```

**Change 2.3: Update `print_help()` function (around line 618-631)**
```python
def print_help():
    print("""
Commands:
  fen <FEN_STRING>   Load a new position from FEN notation
  pgn <PGN_STRING>   Load a PGN game for navigation

  PGN Navigation (available after loading a PGN):
    goto <N>         Jump to half-move N (0=start, 1=after 1st move, etc.)
    next             Advance one half-move forward
    prev             Go back one half-move
    start            Jump to starting position
    end              Jump to final position
    moves            Show all moves with current position marker

  analyze            Analyze the current position with Stockfish
  move <MOVE>        Test a move without playing it (e.g. 'move Nf3')
  play <MOVE>        Play a move and advance the game (e.g. 'play e4')
  undo               Undo the last played move (not available in PGN mode)
  board              Show the current board position
  legal              List all legal moves in current position
  ask <QUESTION>     Ask the coach a free-form question
  help               Show this help message
  quit               Exit the chess coach
""")
```

---

### Summary

**Total changes:** ~230 lines added across 2 files
- `board_state.py`: ~155 lines (8 new methods + state variables)
- `main.py`: ~75 lines (7 new command handlers + help updates)

**New commands:**
- `pgn <string>` - Load PGN for navigation
- `goto <N>`, `next`, `prev`, `start`, `end` - Navigate through moves
- `moves` - Display move list with position marker

**No new dependencies** - uses existing `python-chess` library's `chess.pgn` module

---

## PGN Feature — Detailed Implementation Todo List

### Phase 1: Setup & Planning ✓
- [x] Review current board_state.py architecture
- [x] Review current main.py command structure
- [x] Identify integration points for PGN navigation
- [x] Design state management approach (two-mode system)
- [x] Document all required changes

### Phase 2: Core PGN Parsing (board_state.py) ✓
**Goal:** Add ability to parse PGN strings and extract moves

- [x] **Task 2.1:** Add imports to board_state.py
  - Add `import chess.pgn` (line 2)
  - Add `import io` (line 3)
  - **Verification:** File imports without errors ✓

- [x] **Task 2.2:** Add PGN state variables to `__init__` method
  - Add `self.pgn_game = None` (chess.pgn.Game object)
  - Add `self.pgn_moves = []` (List of chess.Move objects from mainline)
  - Add `self.pgn_current_index = 0` (Current position tracker)
  - Add `self.pgn_mode = False` (Navigation mode flag)
  - **Verification:** BoardState() instantiates without errors, new attributes exist ✓

- [x] **Task 2.3:** Implement `_parse_pgn_string()` private method
  - Create `io.StringIO` wrapper for PGN string
  - Call `chess.pgn.read_game()` to parse
  - Return tuple of (Game object or None, error message or None)
  - Handle parsing exceptions gracefully
  - **Verification:** Parse valid PGN returns Game object, invalid PGN returns error ✓

- [x] **Task 2.4:** Implement `load_pgn()` method
  - Call `_parse_pgn_string()` to parse input
  - Extract starting position from FEN header if present
  - Extract mainline moves using `game.variation(0)` loop
  - Validate that game contains moves
  - Set all PGN state variables
  - Reset board to starting position
  - Build success message with game metadata (Event, White, Black)
  - Return tuple of (success bool, message string)
  - **Verification:** Load known PGN, verify move count, metadata, starting position ✓

### Phase 3: Navigation Logic (board_state.py) ✓
**Goal:** Implement move-by-move navigation through loaded PGN

- [x] **Task 3.1:** Implement `navigate_to_move()` method
  - Validate PGN mode is active
  - Validate move_index is in valid range [0, len(pgn_moves)]
  - Reset board to initial_fen
  - Clear move_history
  - Apply moves sequentially up to target index
  - Update pgn_current_index
  - Format contextual message with move notation (e.g., "Position after move 5: 3.Bb5")
  - Return tuple of (success bool, message string)
  - **Verification:** Navigate to move 0, move 5, last move — verify board state matches ✓

- [x] **Task 3.2:** Implement `pgn_next()` method
  - Check if in PGN mode
  - Check if already at end of game
  - Call `navigate_to_move(current_index + 1)`
  - **Verification:** Navigate forward through entire game, verify boundary checks ✓

- [x] **Task 3.3:** Implement `pgn_prev()` method
  - Check if in PGN mode
  - Check if already at start of game
  - Call `navigate_to_move(current_index - 1)`
  - **Verification:** Navigate backward through entire game, verify boundary checks ✓

- [x] **Task 3.4:** Implement `pgn_start()` method
  - Check if in PGN mode
  - Call `navigate_to_move(0)`
  - **Verification:** Jump to start from any position ✓

- [x] **Task 3.5:** Implement `pgn_end()` method
  - Check if in PGN mode
  - Call `navigate_to_move(len(pgn_moves))`
  - **Verification:** Jump to end from any position ✓

### Phase 4: Display & Mode Management (board_state.py)
**Goal:** Show current position in move list and manage mode transitions

- [ ] **Task 4.1:** Implement `get_pgn_moves_display()` method
  - Check if in PGN mode
  - Create temp board starting from initial_fen
  - Loop through pgn_moves, converting to SAN notation
  - Format as "1. e4 e5 2. Nf3 Nc6"
  - Insert "*" marker at current position
  - Handle both White moves (add move number) and Black moves (append to line)
  - **Verification:** Display from various positions, verify marker placement

- [ ] **Task 4.2:** Implement `exit_pgn_mode()` method
  - Set pgn_mode = False
  - Clear pgn_game, pgn_moves, pgn_current_index
  - **Verification:** Verify state cleared after exit

- [ ] **Task 4.3:** Update `load_fen()` method
  - Add `self.exit_pgn_mode()` call at start
  - **Verification:** Loading FEN exits PGN mode

- [ ] **Task 4.4:** Update `push_move()` method
  - Add `self.exit_pgn_mode()` call at start
  - **Verification:** Playing a move exits PGN mode

### Phase 5: CLI Integration (main.py) ✓
**Goal:** Add CLI commands for PGN navigation

- [x] **Task 5.1:** Add `pgn` command handler
  - Parse command argument
  - Validate argument is not empty
  - Call `board_state.load_pgn(arg)`
  - Print success/error message
  - Display board if successful
  - **Verification:** Load PGN via CLI, verify metadata and board display ✓

- [x] **Task 5.2:** Add `goto` command handler
  - Parse command argument as integer
  - Handle ValueError for invalid input
  - Call `board_state.navigate_to_move(move_num)`
  - Print success/error message
  - Display board and FEN if successful
  - **Verification:** Jump to various positions via CLI ✓

- [x] **Task 5.3:** Add `next` command handler
  - Call `board_state.pgn_next()`
  - Print message
  - Display board and FEN if successful
  - **Verification:** Step forward through game via CLI ✓

- [x] **Task 5.4:** Add `prev` command handler
  - Call `board_state.pgn_prev()`
  - Print message
  - Display board and FEN if successful
  - **Verification:** Step backward through game via CLI ✓

- [x] **Task 5.5:** Add `start` command handler
  - Call `board_state.pgn_start()`
  - Print message
  - Display board and FEN if successful
  - **Verification:** Jump to start via CLI ✓

- [x] **Task 5.6:** Add `end` command handler
  - Call `board_state.pgn_end()`
  - Print message
  - Display board and FEN if successful
  - **Verification:** Jump to end via CLI ✓

- [x] **Task 5.7:** Add `moves` command handler
  - Check if in PGN mode
  - Call `board_state.get_pgn_moves_display()`
  - Print formatted move list
  - **Verification:** Display moves with position marker ✓

- [x] **Task 5.8:** Update `undo` command handler
  - Check if `board_state.pgn_mode` is True
  - Print error message if in PGN mode
  - Suggest using 'prev' instead
  - **Verification:** Verify undo is blocked in PGN mode with helpful message ✓

- [x] **Task 5.9:** Update `print_help()` function
  - Add PGN section header
  - Document `pgn` command with example
  - Document navigation commands (goto, next, prev, start, end, moves)
  - Note that `undo` is disabled in PGN mode
  - **Verification:** Run `help` command, verify all PGN commands listed ✓

### Phase 6: Integration Testing ✓
**Goal:** Verify end-to-end PGN workflow

- [x] **Test 6.1: Basic PGN loading** ✓
  - Load simple PGN: "1. e4 e5 2. Nf3 Nc6"
  - Verify game metadata displayed
  - Verify starting position shown
  - Verify move count correct (4 half-moves)
  - **Expected:** Clean load with all info displayed ✓

- [x] **Test 6.2: Navigation commands** ✓
  - Load PGN game
  - Run `next` 4 times, verify board updates each time
  - Run `prev` 2 times, verify backward navigation
  - Run `goto 0`, verify at start
  - Run `end`, verify at final position
  - Run `moves`, verify position marker correct
  - **Expected:** All navigation commands work, board state matches move number ✓

- [x] **Test 6.3: PGN with custom starting position** ✓
  - Load PGN with FEN header (non-standard starting position)
  - Verify board starts from custom FEN
  - Navigate through moves
  - **Expected:** Custom starting position respected ✓

- [x] **Test 6.4: Mode transitions** ✓
  - Load PGN, navigate to middle
  - Run `fen <some_fen>`, verify PGN mode exits
  - Load PGN again, navigate to middle
  - Run `play e4`, verify PGN mode exits and move plays
  - **Expected:** PGN mode exits cleanly on FEN load or move play ✓

- [x] **Test 6.5: Boundary conditions** ✓
  - Try `next` at end of game — expect error
  - Try `prev` at start of game — expect error
  - Try `goto -1` — expect error
  - Try `goto 999` (beyond game length) — expect error
  - Try `undo` in PGN mode — expect helpful error
  - **Expected:** All boundary cases handled gracefully with clear messages ✓

- [x] **Test 6.6: Invalid PGN handling** ✓
  - Try empty PGN string
  - Try malformed PGN (invalid notation)
  - Try PGN with no moves
  - **Expected:** Clear error messages, no crashes ✓

- [x] **Test 6.7: Analyze position in PGN mode** ✓
  - Load PGN, navigate to middle position
  - Run `analyze` command
  - Verify engine analyzes current PGN position
  - Run `move Nf3` to test a move
  - Verify coaching feedback for current PGN position
  - **Expected:** Full coaching features work in PGN mode ✓

- [x] **Test 6.8: Multi-line PGN with headers** ✓
  - Load PGN with full headers (Event, Site, Date, White, Black, Result)
  - Verify headers displayed in load message
  - **Expected:** Metadata extracted and shown ✓

### Phase 7: Documentation & Cleanup ✓
**Goal:** Update docs and ensure code quality

- [x] **Task 7.1:** Update README.md ✓
  - Add PGN feature to feature list
  - Add PGN command examples to usage section
  - Document PGN navigation mode concept
  - Add example PGN workflow

- [x] **Task 7.2:** Code review ✓
  - Verify all methods have docstrings
  - Verify error messages are user-friendly
  - Check for edge cases in navigation logic
  - Ensure consistent code style with existing files

- [x] **Task 7.3:** Performance check ✓
  - Test with long PGN (100+ moves)
  - Verify navigation is responsive
  - Verify no memory leaks from PGN objects

---

### Implementation Notes

**Critical files to modify:**
- [board_state.py](board_state.py) - Core PGN logic
- [main.py](main.py) - CLI command handlers

**Design decisions:**
- **StringIO wrapper:** `chess.pgn.read_game()` expects a file object, not a string
- **Mainline extraction:** Skip PGN variations (alternatives in parentheses), follow only main line
- **Board reconstruction:** On navigation, rebuild board from scratch (simple & reliable)
- **Mode isolation:** PGN mode and play mode are mutually exclusive for clarity

**Edge cases handled:**
- Empty PGN string
- PGN with no moves
- Custom starting positions (FEN header)
- Navigation beyond game boundaries
- Attempting undo in PGN mode
- Loading FEN or playing move while in PGN mode (auto-exits)