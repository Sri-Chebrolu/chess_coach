import chess


class BoardState:
    """Logic layer — board representation and move validation."""

    def __init__(self, fen=None):
        self.board = chess.Board(fen) if fen else chess.Board()
        self.initial_fen = self.board.fen()
        self.move_history = []

    def load_fen(self, fen: str):
        self.board = chess.Board(fen)
        self.initial_fen = fen
        self.move_history = []
        # Board history is stored in TWO places:
        # 1. python-chess internal: board.move_stack (authoritative, powers undo via board.pop())
        # 2. self.move_history: human-readable SAN list (e.g. ["e4", "Nf3"]) for display only
        # Both reset on load_fen() because a new position starts a fresh session.

    def validate_and_parse_move(self, move_str: str) -> chess.Move | None:
        """Parse user input as SAN (e.g. 'Nf3') or UCI (e.g. 'g1f3')."""
        try:
            return self.board.parse_san(move_str)
        except (chess.InvalidMoveError, chess.IllegalMoveError, chess.AmbiguousMoveError):
            pass
        try:
            move = chess.Move.from_uci(move_str)
            if move in self.board.legal_moves:
                return move
        except (chess.InvalidMoveError, ValueError):
            pass
        return None

    def push_move(self, move: chess.Move):
        self.move_history.append(self.board.san(move))
        self.board.push(move)

    def undo_move(self):
        if self.move_history:
            self.board.pop()
            return self.move_history.pop()
        return None

    def get_legal_moves_san(self) -> list[str]:
        return [self.board.san(m) for m in self.board.legal_moves]

    @property
    def turn(self) -> str:
        return "White" if self.board.turn == chess.WHITE else "Black"

    def display(self) -> str:
        return str(self.board)
