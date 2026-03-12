"""
Regression tests for the "Play against computer opponent without FEN input" feature.

Frontend change: InputPanel now shows the opponent checkbox even when FEN is empty.
When opponent mode is selected with no FEN, App.tsx substitutes chess.STARTING_FEN
before calling /api/validate. These tests verify both sides of that contract.
"""

import unittest
from unittest.mock import patch, MagicMock

import chess
from fastapi.testclient import TestClient

import server
import sessions as session_store
from board_state import BoardState

STARTING_FEN = chess.STARTING_FEN  # rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1


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


def _fake_session(bs: BoardState):
    return ("fake-session-id", {
        "coach": MagicMock(),
        "board_state": bs,
        "engine": FakeEngine(),
        "source_kind": "fen",
    })


class ValidateStartingFenTest(unittest.TestCase):
    """
    /api/validate must accept the starting FEN.
    The frontend now passes STARTING_FEN when opponent mode is enabled and FEN is empty.
    """

    def setUp(self):
        self.client = TestClient(server.app)

    def test_validate_accepts_starting_fen(self):
        """Starting FEN is valid — frontend can pass it when no FEN is typed."""
        response = self.client.post(
            "/api/validate",
            json={"fen": STARTING_FEN, "pgn": None},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(data["source_kind"], "fen")
        self.assertEqual(data["canonical_start_fen"], STARTING_FEN)
        self.assertEqual(data["turn"], "White")

    def test_validate_still_rejects_null_fen_and_null_pgn(self):
        """Regression: null/null still rejected; frontend must always pass an effectiveFen."""
        response = self.client.post(
            "/api/validate",
            json={"fen": None, "pgn": None},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "EMPTY_INPUT")


class SessionInitStartingPositionTest(unittest.TestCase):
    """
    /api/session/init must produce the starting position whether the frontend
    passes STARTING_FEN explicitly or passes fen=null (server-side default).
    """

    def setUp(self):
        self.client = TestClient(server.app)
        session_store.sessions.clear()

    def tearDown(self):
        session_store.sessions.clear()

    def test_session_init_with_explicit_starting_fen(self):
        """Explicit starting FEN → initial_position.fen is the standard starting position."""
        with patch("server.get_or_create_session", return_value=_fake_session(BoardState())):
            response = self.client.post(
                "/api/session/init",
                json={"source_kind": "fen", "fen": STARTING_FEN, "pgn": None},
            )
        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(data["initial_position"]["fen"], STARTING_FEN)
        self.assertEqual(data["source_kind"], "fen")
        self.assertEqual(data["initial_position"]["turn"], "White")

    def test_session_init_with_null_fen_defaults_to_starting_position(self):
        """null fen → server defaults to chess.STARTING_FEN (existing server-side fallback)."""
        with patch("server.get_or_create_session", return_value=_fake_session(BoardState())):
            response = self.client.post(
                "/api/session/init",
                json={"source_kind": "fen", "fen": None, "pgn": None},
            )
        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(data["initial_position"]["fen"], STARTING_FEN)
        self.assertEqual(data["initial_position"]["turn"], "White")

    def test_session_init_timeline_has_initial_entry_for_starting_position(self):
        """Timeline must contain exactly one entry (the initial position) for a fresh game."""
        with patch("server.get_or_create_session", return_value=_fake_session(BoardState())):
            response = self.client.post(
                "/api/session/init",
                json={"source_kind": "fen", "fen": STARTING_FEN, "pgn": None},
            )
        self.assertEqual(response.status_code, 200)
        timeline = response.json()["data"]["timeline"]
        self.assertEqual(len(timeline["entries"]), 1)
        self.assertEqual(timeline["entries"][0]["fen"], STARTING_FEN)
        self.assertEqual(timeline["current_index"], 0)

    def test_session_capabilities_include_opponent_mode(self):
        """Opponent mode must be advertised in session capabilities for FEN sessions."""
        with patch("server.get_or_create_session", return_value=_fake_session(BoardState())):
            response = self.client.post(
                "/api/session/init",
                json={"source_kind": "fen", "fen": STARTING_FEN, "pgn": None},
            )
        self.assertEqual(response.status_code, 200)
        caps = response.json()["data"]["session_capabilities"]
        self.assertTrue(caps.get("opponent_mode"))


if __name__ == "__main__":
    unittest.main()
