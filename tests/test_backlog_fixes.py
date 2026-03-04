import unittest
import asyncio
import time

from board_state import BoardState
from coach import Coach
from server import run_blocking


class BoardUxFixesTests(unittest.TestCase):
    def test_deviation_from_pgn_exits_pgn_mode(self):
        bs = BoardState()
        ok, _ = bs.load_pgn("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6")
        self.assertTrue(ok)
        self.assertTrue(bs.pgn_mode)

        ok, _ = bs.navigate_to_move(1)  # after 1. e4 (black to move)
        self.assertTrue(ok)
        sideline_move = bs.validate_and_parse_move("Nc6")
        self.assertIsNotNone(sideline_move)

        bs.push_move(sideline_move)
        self.assertFalse(bs.pgn_mode)
        self.assertEqual(bs.move_history[-1], "Nc6")


class CoachResponseFixesTests(unittest.TestCase):
    def test_coach_response_is_capped_to_four_sentences(self):
        coach = Coach.__new__(Coach)
        formatted = coach._format_response("One. Two! Three? Four. Five.")
        self.assertEqual(formatted, "One. Two! Three? Four.")

    def test_coach_response_empty_fallback(self):
        coach = Coach.__new__(Coach)
        formatted = coach._format_response("   ")
        self.assertIn("Nice effort.", formatted)
        self.assertIn("?", formatted)


class LatencyPathTests(unittest.IsolatedAsyncioTestCase):
    async def test_run_blocking_uses_worker_thread(self):
        ticks = 0

        async def ticker():
            nonlocal ticks
            for _ in range(4):
                await asyncio.sleep(0.02)
                ticks += 1

        def blocking_work():
            time.sleep(0.1)
            return "ok"

        result, _ = await asyncio.gather(
            run_blocking("test.blocking", blocking_work),
            ticker(),
        )
        self.assertEqual(result, "ok")
        self.assertGreaterEqual(ticks, 3)


if __name__ == "__main__":
    unittest.main()
