#!/usr/bin/env python3
"""Create Linear tickets from the chess_coach backlog.

Usage:
    LINEAR_API_KEY=lin_api_xxx python create_linear_tickets.py
"""

import json
import os
import sys
import urllib.request

API_URL = "https://api.linear.app/graphql"
API_KEY = os.environ.get("LINEAR_API_KEY", "")
TEAM_NAME = "AI_chess_coach"

# Priority mapping: Linear uses 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
PRIORITY_MAP = {"P0": 1, "P1": 2, "P2": 3, "P3": 4}

TICKETS = [
    {
        "title": "Allow sideline exploration from any PGN position",
        "priority": "P2",
        "label": "board-ux",
        "body": """## Description
User should be able to make alternative moves at any point in a PGN game to explore sidelines, without being locked to the recorded moves.

## Acceptance Criteria
- When in PGN mode, user can make a move that deviates from the recorded game
- Board enters "sideline" mode with clear visual indicator
- User can navigate back to the original PGN line
- Sideline moves are tracked separately from the main PGN line

## Technical Context
- `board_state.py` — `BoardState.pgn_mode`, move validation logic in `validate_and_parse_move()`
- `server.py` — `/api/move` endpoint, `/api/pgn/navigate` endpoint
- `frontend/src/organisms/BoardPanel.tsx` — `handlePieceDrop()` (lines 73-124)
- `frontend/src/organisms/PgnNavigator.tsx` — navigation actions and state""",
    },
    {
        "title": "Prompt user to select color when FEN is provided",
        "priority": "P2",
        "label": "board-ux",
        "body": """## Description
If a FEN string is provided, the user should be prompted to select white or black. Board populates with the selected color on the user's side.

## Acceptance Criteria
- After submitting a FEN, a color selection UI appears (white/black)
- Board orientation matches the user's chosen color
- Selected color persists for the session (no flipping on turn change)

## Technical Context
- `frontend/src/organisms/InputPanel.tsx` — FEN submission flow
- `frontend/src/organisms/BoardPanel.tsx` — `boardOrientation` prop (line 145, currently `turn`-based)
- `frontend/src/App.tsx` — state reducer, needs new `SET_ORIENTATION` action
- `frontend/src/types.ts` — add orientation to `AnalysisViewState`""",
    },
    {
        "title": "Hide best move by default; reveal on Hint button click",
        "priority": "P2",
        "label": "board-ux",
        "body": """## Description
In any given position, the best move should not be shown by default. Only shown when user clicks "Hint".

## Acceptance Criteria
- Best move arrow and top-move cards are hidden by default
- A "Hint" button is visible; clicking it reveals the best move
- Hint state resets after each new move

## Technical Context
- `frontend/src/organisms/BoardPanel.tsx` — PV arrows logic (lines 35-44), `customArrows` prop (line 152)
- `frontend/src/molecules/MoveCard.tsx` — engine move display cards
- `frontend/src/App.tsx` — state for hint visibility toggle""",
    },
    {
        "title": "Position Hint button at bottom-right of chessboard",
        "priority": "P2",
        "label": "board-ux",
        "body": """## Description
The "Hint" button should be located at the bottom right of the chessboard, just one square outside the h1 square on the user's side.

## Acceptance Criteria
- Hint button is visually anchored to the right of the h1 corner of the board
- Button position adapts to board orientation (always user's bottom-right)
- Button does not overlap with the board or eval bar

## Technical Context
- `frontend/src/organisms/BoardPanel.tsx` — board layout and sizing (ResizeObserver, lines 64-71)
- CSS positioning relative to board container""",
    },
    {
        "title": "Add computer opponent with configurable ELO for FEN positions",
        "priority": "P0",
        "label": "opponent-play",
        "body": """## Description
If a FEN string is provided, a computer with a user-specified ELO rating should move the opponent's pieces.

## Acceptance Criteria
- User can specify an ELO rating when starting a FEN session
- Engine plays opponent moves automatically at approximate ELO strength
- Moves are played with 2 second pause
- User sees the opponent's move animated on the board

## Technical Context
- `engine.py` — `EngineAnalysis` class, Stockfish UCI options (`UCI_LimitStrength`, `UCI_Elo`)
- `server.py` — new endpoint or extension of `/api/move` to trigger engine reply
- `board_state.py` — apply engine move to board state
- `frontend/src/organisms/BoardPanel.tsx` — animate opponent move, disable interaction during opponent turn
- `frontend/src/organisms/InputPanel.tsx` — ELO input field
- `frontend/src/App.tsx` — state for opponent mode and ELO""",
    },
    {
        "title": "Reduce coach response latency to under 5 seconds",
        "priority": "P1",
        "label": "coach",
        "body": """## Description
Coach response arrives ~30s after a move; investigate whether this is streaming, model latency, or Stockfish blocking the event loop. Target: < 5s perceived latency.

## Acceptance Criteria
- Perceived latency from move to first coach text < 5 seconds
- Root cause identified (streaming, model, Stockfish, or combination)
- Implement streaming if not already present

## Technical Context
- `coach.py` — `_send()` method, Anthropic API call (blocking, no streaming)
- `server.py` — `/api/move` endpoint calls engine analysis + coach sequentially
- `engine.py` — `analyze_position()` time limit (1.0s default)
- Frontend — no SSE/WebSocket; responses are full JSON after completion""",
    },
    {
        "title": "Coach only responds on suboptimal moves or user questions",
        "priority": "P1",
        "label": "coach",
        "body": """## Description
The coach should only respond when: (a) the user makes a move that is not the "best" move per Stockfish, or (b) the user asks a question in chat.

## Acceptance Criteria
- If user plays the best move, coach does not generate a response (or gives brief affirmation)
- If user plays a suboptimal move, coach provides Socratic feedback
- Chat only questions when move quality is not the "Best Move" per Stockfish
- "Best move" defined as the top engine move (or within a small centipawn threshold)

## Technical Context
- `server.py` — `/api/move` endpoint, move comparison logic
- `coach.py` — `compare_moves()` method, conditional call based on delta
- `frontend/src/organisms/BoardPanel.tsx` — `handlePieceDrop()`, conditionally append coach message""",
    },
    {
        "title": 'Fix "Analysis failed" error when moving pieces before coach responds',
        "priority": "P3",
        "label": "bug",
        "body": """## Description
If the user moves white and black pieces before the coach response is output, a system message "Analysis failed. Failed to parse server response." appears.

## Acceptance Criteria
- User can make multiple rapid moves without error
- Pending coach requests are cancelled or queued gracefully
- No "Analysis failed" system messages during normal play

## Technical Context
- `frontend/src/organisms/BoardPanel.tsx` — `handlePieceDrop()` sends `/api/move` without cancelling prior request
- `frontend/src/api.ts` — fetch wrapper, no AbortController usage
- `server.py` — `/api/move` may receive stale FEN if board advanced
- Likely cause: race condition — second move sends while first `/api/move` is still pending; response for stale position fails to parse""",
    },
    {
        "title": 'Fix "No PGN loaded" error when clicking PGN navigation buttons',
        "priority": "P3",
        "label": "bug",
        "body": """## Description
When a PGN string is provided, clicking Start/Prev/Next/End buttons shows "No PGN loaded in this session."

## Acceptance Criteria
- All four navigation buttons work correctly after loading a PGN
- Board updates to correct position on each navigation action
- Move counter updates accurately

## Technical Context
- `frontend/src/organisms/PgnNavigator.tsx` — `handleNavigate()` calls `/api/pgn/navigate`
- `server.py` — `/api/pgn/navigate` checks `bs.pgn_mode`; returns `NO_PGN_LOADED` error
- `server.py` — `/api/analyze` may call `load_fen()` instead of `load_pgn()` (known gotcha)
- `board_state.py` — `pgn_mode` flag set only by `load_pgn()`, not `load_fen()`
- Likely cause: session's `board_state` not entering `pgn_mode` because `/api/analyze` uses wrong loader""",
    },
    {
        "title": 'Fix false "Exited PGN history" message when making moves in PGN mode',
        "priority": "P3",
        "label": "bug",
        "body": """## Description
When a PGN string is provided and user moves a piece, a system message shows "Exited PGN history. You are now exploring a sideline."

## Acceptance Criteria
- Moving the next expected PGN move does not trigger the sideline message
- Sideline message only appears when user deviates from recorded moves
- If PGN navigation is broken (Bug #2), fix that first as it may be related

## Technical Context
- `board_state.py` — PGN mode exit logic in `validate_and_parse_move()` or move application
- `server.py` — `/api/move` endpoint, sideline detection logic
- `frontend/src/organisms/BoardPanel.tsx` — `handlePieceDrop()` response handling
- Likely related to Bug #2 — if `pgn_mode` isn't set correctly, any move looks like a deviation""",
    },
]


def graphql(query: str, variables: dict | None = None) -> dict:
    payload = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": API_KEY,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def get_team_id() -> str:
    result = graphql("{ teams { nodes { id name } } }")
    for team in result["data"]["teams"]["nodes"]:
        if team["name"] == TEAM_NAME:
            return team["id"]
    teams = [t["name"] for t in result["data"]["teams"]["nodes"]]
    print(f"Team '{TEAM_NAME}' not found. Available teams: {teams}")
    sys.exit(1)


def get_or_create_label(team_id: str, label_name: str) -> str:
    result = graphql(
        """query($teamId: String!) {
            issueLabels(filter: { team: { id: { eq: $teamId } } }) {
                nodes { id name }
            }
        }""",
        {"teamId": team_id},
    )
    for label in result["data"]["issueLabels"]["nodes"]:
        if label["name"].lower() == label_name.lower():
            return label["id"]
    # Create it
    result = graphql(
        """mutation($input: IssueLabelCreateInput!) {
            issueLabelCreate(input: $input) {
                issueLabel { id name }
                success
            }
        }""",
        {"input": {"name": label_name, "teamId": team_id}},
    )
    return result["data"]["issueLabelCreate"]["issueLabel"]["id"]


def create_issue(team_id: str, ticket: dict, label_id: str) -> dict:
    result = graphql(
        """mutation($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                issue { id identifier title url }
                success
            }
        }""",
        {
            "input": {
                "teamId": team_id,
                "title": ticket["title"],
                "description": ticket["body"],
                "priority": PRIORITY_MAP[ticket["priority"]],
                "labelIds": [label_id],
            }
        },
    )
    return result["data"]["issueCreate"]["issue"]


def main():
    if not API_KEY:
        print("Set LINEAR_API_KEY environment variable.")
        print("Usage: LINEAR_API_KEY=lin_api_xxx python create_linear_tickets.py")
        sys.exit(1)

    print(f"Finding team '{TEAM_NAME}'...")
    team_id = get_team_id()
    print(f"Team ID: {team_id}")

    # Pre-create/fetch all labels
    label_cache: dict[str, str] = {}
    label_names = {t["label"] for t in TICKETS}
    for name in label_names:
        print(f"Resolving label '{name}'...")
        label_cache[name] = get_or_create_label(team_id, name)

    print(f"\nCreating {len(TICKETS)} tickets...\n")
    for i, ticket in enumerate(TICKETS, 1):
        label_id = label_cache[ticket["label"]]
        issue = create_issue(team_id, ticket, label_id)
        print(f"  [{i}/{len(TICKETS)}] {issue['identifier']}: {issue['title']}")
        print(f"           {issue['url']}")

    print(f"\nDone! Created {len(TICKETS)} tickets.")


if __name__ == "__main__":
    main()
