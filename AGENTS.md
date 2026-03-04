# AGENTS.md

## Cursor Cloud specific instructions

### Overview

AI Chess Coach — a Socratic-method chess coaching app with a Python/FastAPI backend and React/Vite/TypeScript frontend. Stockfish provides engine analysis; Anthropic Claude provides AI coaching responses.

### Services

| Service | Command | Port |
|---|---|---|
| FastAPI backend | `cd /workspace && source .venv/bin/activate && uvicorn server:app --reload --port 8000` | 8000 |
| React frontend | `cd /workspace/frontend && npm run dev` | 5173 |

The frontend proxies `/api` requests to the backend via Vite config (`frontend/vite.config.ts`).

### Environment variables

A `.env` file in the project root must contain:
- `ANTHROPIC_API_KEY` — required for Claude AI coaching (set via Cursor secrets)
- `STOCKFISH_PATH` — path to the Stockfish binary; use `/usr/games/stockfish` on this VM

### Key caveats

- **Stockfish** is installed via `sudo apt-get install stockfish` and lives at `/usr/games/stockfish` (not the macOS path referenced in README).
- **Python venv**: The project uses a `.venv` virtual environment at `/workspace/.venv`. Always activate it before running backend commands.
- **No lockfile**: The frontend has no npm lockfile committed; `npm install` resolves from `package.json` each time.
- **TypeScript**: There is a pre-existing TS error in `src/organisms/BoardPanel.tsx` (type mismatch on `Arrow[]`). Vite builds succeed despite this; `tsc --noEmit` will report it.
- **python3.12-venv**: Must be installed via `sudo apt-get install -y python3.12-venv` before creating the venv.
- **Sessions**: Backend sessions are in-memory only (no database); they expire after 30 minutes of inactivity.

### Standard commands

See `README.md` for CLI usage. See `frontend/package.json` for `dev`/`build`/`preview` scripts. The backend has no dedicated lint or test commands configured in the repository.
