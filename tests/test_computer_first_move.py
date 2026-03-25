"""
Regression test: computer makes first move when player selects black.

Frontend fix: a useEffect in App.tsx calls handleOpponentMove() immediately after
ANALYSIS_READY is dispatched, when it's the computer's turn at game start.

These tests verify the backend contract that useEffect relies on:
- /api/opponent-move accepts the starting FEN (white to move)
- The response contains a legal white move
- After the move, it's black's turn
- The timeline_update is well-formed for the frontend to consume
"""

import unittest
from unittest.mock import patch, MagicMock

import chess
from fastapi.testclient import TestClient

from backend import server
from backend import sessions as session_store
from backend.board_state import BoardState

STARTING_FEN = chess.STARTING_FEN  # white to move


class FakeEngine:
    def analyze_position(self, board: chess.Board, num_moves=3):
        legal_move = next(iter(board.legal_moves))
        return {
            "top_moves": [{
                "move": legal_move,
                "san": board.san(legal_move),
                "uci": legal_move.uci(),
                "from_square": chess.square_name(legal_move.from_square),
                "to_square": chess.square_name(legal_move.to_square),
                "score_cp_white": 25,
                "mate": None,
                "pv": [board.san(legal_move)],
            }],
            "score_semantics": {"perspective": "white", "normalized_for_turn": False},
        }

    def get_opponent_move(self, board: chess.Board, elo: int) -> dict:
        # Always picks the first legal move deterministically
        move = next(iter(board.legal_moves))
        return {
            "san": board.san(move),
            "uci": move.uci(),
            "from_square": chess.square_name(move.from_square),
            "to_square": chess.square_name(move.to_square),
        }


def _fake_session(bs: BoardState):
    session_id = "fake-session-id"
    session = {
        "coach": MagicMock(),
        "board_state": bs,
        "engine": FakeEngine(),
        "source_kind": "fen",
    }
    session_store.sessions[session_id] = session
    return session_id, session


class ComputerFirstMoveTest(unittest.TestCase):
    """
    When the player selects black, the frontend's useEffect triggers
    handleOpponentMove(currentFen) with the starting FEN immediately after
    ANALYSIS_READY. These tests verify /api/opponent-move handles that call correctly.
    """

    def setUp(self):
        self.client = TestClient(server.app)
        session_store.sessions.clear()
        self.bs = BoardState()
        self.session_id, _ = _fake_session(self.bs)

    def tearDown(self):
        session_store.sessions.clear()

    def test_opponent_move_from_starting_position_returns_200(self):
        """Starting FEN (white to move) is a valid input for /api/opponent-move."""
        response = self.client.post(
            "/api/opponent-move",
            json={"session_id": self.session_id, "fen": STARTING_FEN, "elo": 1500},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])

    def test_opponent_move_from_starting_position_returns_legal_white_move(self):
        """The returned move must be a legal white move from the starting position."""
        response = self.client.post(
            "/api/opponent-move",
            json={"session_id": self.session_id, "fen": STARTING_FEN, "elo": 1500},
        )
        data = response.json()["data"]
        move_san = data["opponent_move"]["san"]
        move_uci = data["opponent_move"]["uci"]

        board = chess.Board(STARTING_FEN)
        legal_ucis = {m.uci() for m in board.legal_moves}
        self.assertIn(move_uci, legal_ucis, f"Returned move {move_san} ({move_uci}) is not legal from starting position")

    def test_position_after_computer_first_move_is_black_to_move(self):
        """After white's first move, position_after.turn must be 'Black' — player's turn."""
        response = self.client.post(
            "/api/opponent-move",
            json={"session_id": self.session_id, "fen": STARTING_FEN, "elo": 1500},
        )
        data = response.json()["data"]
        self.assertEqual(data["position_after"]["turn"], "Black")

    def test_timeline_update_has_opponent_play_source(self):
        """Timeline entry for computer's first move must be tagged 'opponent_play'."""
        response = self.client.post(
            "/api/opponent-move",
            json={"session_id": self.session_id, "fen": STARTING_FEN, "elo": 1500},
        )
        update = response.json()["data"]["timeline_update"]
        self.assertEqual(update["mode"], "append")
        self.assertEqual(len(update["entries"]), 1)
        self.assertEqual(update["entries"][0]["source"], "opponent_play")

    def test_timeline_update_new_current_index_is_1(self):
        """After the computer's first move, new_current_index must be 1."""
        response = self.client.post(
            "/api/opponent-move",
            json={"session_id": self.session_id, "fen": STARTING_FEN, "elo": 1500},
        )
        update = response.json()["data"]["timeline_update"]
        self.assertEqual(update["new_current_index"], 1)

    def test_opponent_move_rejected_for_unknown_session(self):
        """Safeguard: unknown session_id returns SESSION_NOT_FOUND, not 500."""
        response = self.client.post(
            "/api/opponent-move",
            json={"session_id": "does-not-exist", "fen": STARTING_FEN, "elo": 1500},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"]["code"], "SESSION_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
