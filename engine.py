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
            multipv=num_moves,
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
            chess.engine.Limit(time=self.time_limit),
        )
        score = result["score"].white()
        return {
            "move": move,
            "san": board.san(move),
            "score_cp": score.score(mate_score=10000),
            "mate": score.mate(),
        }
