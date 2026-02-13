import chess
import chess.engine
import os
import json
import time
from dotenv import load_dotenv

load_dotenv()

_DEBUG_LOG_PATH = "/Users/sri/Desktop/chess_coach/.cursor/debug.log"


def _debug_log(*, run_id: str, hypothesis_id: str, location: str, message: str, data: dict):
    # #region agent log
    try:
        payload = {
            "id": f"log_{int(time.time() * 1000)}_{os.getpid()}",
            "timestamp": int(time.time() * 1000),
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
        }
        with open(_DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
    # #endregion agent log


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
        # #region agent log
        _debug_log(
            run_id="pre-fix",
            hypothesis_id="A",
            location="engine.py:analyze_position:entry",
            message="analyze_position called",
            data={
                "fen": board.fen(),
                "turn": "white" if board.turn else "black",
                "num_moves": num_moves,
                "legal_moves_count": board.legal_moves.count(),
            },
        )
        # #endregion agent log
        moves = []
        for info in result:
            score = info["score"].white()
            pv_moves = list(info.get("pv", []))[:5]
            pv_uci = [m.uci() for m in pv_moves]
            legal_on_root = [board.is_legal(m) for m in pv_moves]

            # Build PV SAN correctly by pushing moves as we go.
            pv_board = board.copy()
            pv_san: list[str] = []
            seq_legality: list[bool] = []
            for m in pv_moves:
                is_legal_now = pv_board.is_legal(m)
                seq_legality.append(is_legal_now)
                if not is_legal_now:
                    pv_san.append(m.uci())
                    break
                pv_san.append(pv_board.san(m))
                pv_board.push(m)

            # #region agent log
            _debug_log(
                run_id="pre-fix",
                hypothesis_id="A",
                location="engine.py:analyze_position:pv",
                message="PV legality vs root/sequential",
                data={
                    "root_fen": board.fen(),
                    "pv_uci": pv_uci,
                    "legal_on_root": legal_on_root,
                    "legal_sequential": seq_legality,
                    "pv_san_or_uci": pv_san,
                },
            )
            # #endregion agent log

            moves.append({
                "move": info["pv"][0],
                "san": board.san(info["pv"][0]),
                "score_cp": score.score(mate_score=10000),
                "mate": score.mate(),
                "pv": pv_san,
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
