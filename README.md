# AI Chess Coach

An interactive command-line chess coach that combines **Stockfish** engine analysis with **Claude AI** to teach chess principles through Socratic dialogue.

Load any position, get strategic analysis grounded in positional heuristics, test candidate moves, and receive principle-based feedback — all through a conversational interface.

## Features

- **Position Analysis** — Get Claude's strategic breakdown of any position, grounded in Stockfish's top engine lines
- **Move Comparison** — Test a candidate move and see how it compares to the engine's best, with before/after heuristic analysis
- **Socratic Coaching** — Claude teaches through guiding questions rather than just giving answers
- **Positional Heuristics** — Analysis grounded in concrete chess principles: center control, piece activity, king safety, pawn structure, development, and tactical motifs
- **Interactive Play** — Play moves on the board, undo them, and explore variations
- **Conversational Context** — Ask follow-up questions that reference prior analysis

## Architecture

The project uses a 3-layer design:

| Layer | Module | Role |
|-------|--------|------|
| **Ground Truth** | `engine.py` | Stockfish UCI wrapper — provides objective evaluation and top moves |
| **Logic** | `board_state.py`, `heuristics.py` | Board management, move validation, and positional feature extraction |
| **Reasoning** | `coach.py` | Claude AI integration — generates principle-based coaching from engine data and heuristics |

## Prerequisites

- Python 3.14+
- [Stockfish](https://stockfishchess.org/download/) binary
- [Anthropic API key](https://console.anthropic.com/)

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd chess_coach

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=your-api-key-here
STOCKFISH_PATH=./stockfish/stockfish-macos-m1-apple-silicon
```

Adjust `STOCKFISH_PATH` to point to your Stockfish binary.

## Usage

```bash
python main.py
```

### Commands

| Command | Description |
|---------|-------------|
| `fen <FEN>` | Load a position from a FEN string |
| `analyze` | Analyze the current position with engine + AI coaching |
| `move <MOVE>` | Test a move without playing it (get comparison feedback) |
| `play <MOVE>` | Play a move on the board (advances the game) |
| `undo` | Undo the last played move |
| `board` | Display the current board |
| `legal` | List all legal moves |
| `ask <QUESTION>` | Ask the coach a free-form question about the position |
| `help` | Show available commands |
| `quit` | Exit |

Moves can be entered in standard algebraic notation (`Nf3`) or UCI format (`g1f3`).

### Example Session

```
=== AI Chess Coach ===
Type 'help' for commands, or 'fen <string>' to load a position.

chess> fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1
Position loaded. Black to move.

chess> analyze
Analyzing position...
[Claude explains the key strategic themes of the position]

chess> move c5
Evaluating ...c5...
[Claude compares c5 against the engine's top choice with heuristic deltas]

chess> ask Why is central control important here?
[Claude responds with context from the prior analysis]

chess> quit
Goodbye!
```

## Project Structure

```
chess_coach/
├── main.py            # CLI entry point and command loop
├── coach.py           # Claude AI coaching logic
├── engine.py          # Stockfish engine wrapper
├── board_state.py     # Chess board management and move parsing
├── heuristics.py      # Positional feature extraction
├── requirements.txt   # Python dependencies
└── .env               # API key and engine path (not committed)
```
