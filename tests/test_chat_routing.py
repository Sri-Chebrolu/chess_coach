import unittest

import chess
from fastapi.testclient import TestClient

import server
import sessions as session_store


class FakeEngine:
    def __init__(self):
        self.analyze_calls: list[str] = []
        self.evaluate_calls: list[tuple[str, str]] = []

    def analyze_position(self, board: chess.Board, num_moves=3):
        self.analyze_calls.append(board.fen())
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

    def evaluate_move(self, board: chess.Board, move: chess.Move):
        self.evaluate_calls.append((board.fen(), move.uci()))
        return {
            "move": move,
            "san": board.san(move),
            "uci": move.uci(),
            "from_square": chess.square_name(move.from_square),
            "to_square": chess.square_name(move.to_square),
            "score_cp_white": 10,
            "mate": None,
        }


class FakeCoach:
    def __init__(self):
        self.calls: list[str] = []

    def build_position_analysis_prompt(self, **kwargs):
        self.calls.append("build_position")
        return "position prompt"

    def analyze_position_stream(self, **kwargs):
        self.calls.append("stream_position")
        yield "position"

    def build_move_comparison_prompt(self, **kwargs):
        self.calls.append("build_comparison")
        return "comparison prompt"

    def compare_moves_stream(self, **kwargs):
        self.calls.append("stream_comparison")
        yield "comparison"


class ChatRoutingTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)
        self.engine = FakeEngine()
        self.coach = FakeCoach()
        session_store.sessions.clear()
        session_store.sessions["test-session"] = {
            "coach": self.coach,
            "engine": self.engine,
            "board_state": object(),
        }

    def tearDown(self):
        session_store.sessions.clear()

    def test_position_mode_uses_position_analysis_even_with_fen_before(self):
        board_before = chess.Board()
        board_after = board_before.copy()
        board_after.push_san("e4")

        response = self.client.post(
            "/api/chat",
            json={
                "session_id": "test-session",
                "analysis_mode": "position",
                "fen_after": board_after.fen(),
                "fen_before": board_before.fen(),
                "message": "What changed here?",
                "player_color": "white",
                "side_to_move": "black",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("event: token", response.text)
        self.assertEqual(self.coach.calls, ["build_position", "stream_position"])
        self.assertEqual(self.engine.analyze_calls, [board_after.fen()])
        self.assertEqual(self.engine.evaluate_calls, [])

    def test_move_comparison_mode_requires_fen_before(self):
        board_after = chess.Board()

        response = self.client.post(
            "/api/chat",
            json={
                "session_id": "test-session",
                "analysis_mode": "move_comparison",
                "fen_after": board_after.fen(),
                "fen_before": None,
                "message": "Why this move?",
                "player_color": "white",
                "side_to_move": "white",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "INVALID_CHAT_CONTEXT")

    def test_move_comparison_mode_uses_pre_and_post_move_positions(self):
        board_before = chess.Board()
        board_after = board_before.copy()
        board_after.push_san("e4")

        response = self.client.post(
            "/api/chat",
            json={
                "session_id": "test-session",
                "analysis_mode": "move_comparison",
                "fen_after": board_after.fen(),
                "fen_before": board_before.fen(),
                "message": "Explain this move.",
                "player_color": "white",
                "side_to_move": "black",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("event: token", response.text)
        self.assertEqual(self.coach.calls, ["build_comparison", "stream_comparison"])
        self.assertEqual(self.engine.analyze_calls, [board_before.fen()])
        self.assertEqual(self.engine.evaluate_calls, [(board_before.fen(), "e2e4")])

    def test_move_comparison_mode_rejects_non_adjacent_positions(self):
        board_before = chess.Board()
        board_after = board_before.copy()
        board_after.push_san("e4")
        board_after.push_san("e5")

        response = self.client.post(
            "/api/chat",
            json={
                "session_id": "test-session",
                "analysis_mode": "move_comparison",
                "fen_after": board_after.fen(),
                "fen_before": board_before.fen(),
                "message": "Explain this move.",
                "player_color": "white",
                "side_to_move": "white",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("event: error", response.text)
        self.assertEqual(self.coach.calls, [])
        self.assertEqual(self.engine.analyze_calls, [])
        self.assertEqual(self.engine.evaluate_calls, [])


if __name__ == "__main__":
    unittest.main()
