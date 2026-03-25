import unittest

from backend.board_state import BoardState
from backend.coach import Coach


PGN_MOVE_27_REGRESSION = """[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.02.24"]
[Round "?"]
[White "rfendich10"]
[Black "sri8281"]
[Result "1-0"]
[TimeControl "600"]
[WhiteElo "892"]
[BlackElo "853"]
[Termination "rfendich10 won by resignation"]
[ECO "C26"]
[EndTime "22:55:47 GMT+0000"]
[Link "https://www.chess.com/game/live/165164534738?move=53"]

1. e4 e5 2. Bc4 Nf6 3. Nc3 Bc5 4. d3 Nc6 5. Bg5 d6 6. Nf3 Bd7 7. a3 Qe7 8. Qd2
O-O-O 9. O-O-O h6 10. Be3 Bxe3 11. Qxe3 Ng4 12. Qe2 f5 13. exf5 Bxf5 14. Nd5 Qd7
15. h3 Nf6 16. g4 Be6 17. Nxf6 gxf6 18. Bb5 a6 19. Bc4 Bxc4 20. dxc4 Rhe8 21. h4
Nd4 22. Qd3 Nxf3 23. Qxf3 Rf8 24. Rd5 Qc6 25. Rhd1 Qxc4 26. Qf5+ Kb8 27. b3 Qf4+
28. Qxf4 exf4 29. g5 fxg5 30. hxg5 hxg5 31. Rxg5 Rde8 32. Rd2 Re7 33. Kb2 Rfe8
34. Rf5 Re4 35. f3 Re3 36. Rxf4 R8e5 37. Rf8+ Ka7 38. Rf4 a5 39. Rf2 a4 40.
Rxa4+ Kb6 41. f4 Rf5 42. Rb4+ Kc5 43. Rc4+ Kd5 44. Rb4 Kc6 45. a4 b6 46. Rc4+
Kb7 47. b4 Rh5 48. f5 Rhh3 49. f6 Re8 50. f7 Rf8 51. Re4 c5 52. Re8 c4 53. Rxf8
c3+ 54. Kb3 d5 55. Rg8 1-0
"""

INCORRECT_FEN_BEFORE_FIX = "1k1r1r2/1pp5/p2p1p1p/3RpQ2/2q3PP/P7/1PP2P2/2KR4 w - - 2 27"
CORRECT_FEN_AFTER_27_B3 = "1k1r1r2/1pp5/p2p1p1p/3RpQ2/2q3PP/PP6/2P2P2/2KR4 b - - 0 27"
MOVE_27_FIRST_HALF_MOVE_INDEX = 53


class PgnNavigationRegressionTest(unittest.TestCase):
    def test_build_timeline_returns_post_move_position_for_first_half_move_of_move_27(self):
        board_state = BoardState()

        entries = board_state.build_timeline(PGN_MOVE_27_REGRESSION)
        entry = entries[MOVE_27_FIRST_HALF_MOVE_INDEX]

        self.assertEqual(entry["san"], "b3")
        self.assertEqual(entry["fen"], CORRECT_FEN_AFTER_27_B3)
        self.assertEqual(entry["turn"], "Black")
        self.assertNotEqual(entry["fen"], INCORRECT_FEN_BEFORE_FIX)

    def test_ui_timeline_selection_at_index_53_uses_the_correct_post_move_entry(self):
        board_state = BoardState()
        entries = board_state.build_timeline(PGN_MOVE_27_REGRESSION)

        # Frontend move clicks call onSelectEntry(entry.index), then App.handleNavigate()
        # reads timeline.entries[index] directly. It does not call BoardState.navigate_to_move().
        selected_index = MOVE_27_FIRST_HALF_MOVE_INDEX
        selected_entry = entries[selected_index]
        previous_entry = entries[selected_index - 1]

        self.assertEqual(selected_entry["index"], MOVE_27_FIRST_HALF_MOVE_INDEX)
        self.assertEqual(selected_entry["san"], "b3")
        self.assertEqual(selected_entry["fen"], CORRECT_FEN_AFTER_27_B3)
        self.assertEqual(selected_entry["turn"], "Black")
        self.assertEqual(previous_entry["san"], "Kb8")
        self.assertEqual(previous_entry["fen"], INCORRECT_FEN_BEFORE_FIX)

    def test_move_comparison_prompt_can_use_post_move_fen_and_turn_together(self):
        coach = Coach.__new__(Coach)

        prompt = coach.build_move_comparison_prompt(
            fen=CORRECT_FEN_AFTER_27_B3,
            turn_after="Black",
            best_move="Qc6",
            best_score=-111,
            user_move="Qf4+",
            user_score=-132,
            delta=-21,
            top_moves_str="1. Qc6 (-111 cp)",
            heuristics_before="before",
            heuristics_after="after",
        )

        self.assertIn(f"FEN: {CORRECT_FEN_AFTER_27_B3}", prompt)
        self.assertIn("Side to move: Black", prompt)


if __name__ == "__main__":
    unittest.main()
