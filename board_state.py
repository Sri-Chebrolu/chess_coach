import chess
import chess.pgn
import io


class BoardState:
    """Logic layer — board representation and move validation."""

    def __init__(self, fen=None):
        self.board = chess.Board(fen) if fen else chess.Board()
        self.initial_fen = self.board.fen()
        self.move_history = []
        self.pgn_game = None
        self.pgn_moves = []
        self.pgn_current_index = 0
        self.pgn_mode = False

    def load_fen(self, fen: str):
        self.exit_pgn_mode()
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
        if self.pgn_mode and self.pgn_current_index < len(self.pgn_moves):
            expected_move = self.pgn_moves[self.pgn_current_index]
            if move == expected_move:
                # User played the expected PGN move — advance index, stay in PGN mode
                self.move_history.append(self.board.san(move))
                self.board.push(move)
                self.pgn_current_index += 1
                return
            # User deviated from PGN — exit to sideline mode
        self.exit_pgn_mode()
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

    def _parse_pgn_string(self, pgn_string: str) -> tuple[chess.pgn.Game | None, str | None]:
        try:
            pgn_io = io.StringIO(pgn_string)
            game = chess.pgn.read_game(pgn_io)
            if game is None:
                return None, "No valid PGN game found"
            return game, None
        except Exception as e:
            return None, f"PGN parsing error: {str(e)}"

    def load_pgn_file(self, filepath: str) -> tuple[bool, str]:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                pgn_content = f.read()
            return self.load_pgn(pgn_content)
        except FileNotFoundError:
            return False, f"File not found: {filepath}"
        except PermissionError:
            return False, f"Permission denied: {filepath}"
        except Exception as e:
            return False, f"Error reading file: {str(e)}"

    def load_pgn(self, pgn_string: str) -> tuple[bool, str]:
        game, error = self._parse_pgn_string(pgn_string)
        if error:
            return False, error

        if "FEN" in game.headers:
            starting_fen = game.headers["FEN"]
            board = chess.Board(starting_fen)
        else:
            board = chess.Board()
            starting_fen = board.fen()

        moves = []
        node = game
        while node.variations:
            next_node = node.variation(0)
            moves.append(next_node.move)
            node = next_node

        if not moves:
            return False, "PGN contains no moves"

        self.pgn_game = game
        self.pgn_moves = moves
        self.pgn_current_index = 0
        self.pgn_mode = True
        self.board = chess.Board(starting_fen)
        self.initial_fen = starting_fen
        self.move_history = []

        move_count = len(moves)
        full_moves = (move_count + 1) // 2
        message = f"Loaded game with {move_count} half-moves ({full_moves} full moves)"
        if "White" in game.headers and "Black" in game.headers:
            message += f"\n{game.headers['White']} vs {game.headers['Black']}"
        if "Event" in game.headers:
            message += f"\nEvent: {game.headers['Event']}"
        message += "\nCurrently at starting position"
        message += "\nUse 'goto <N>', 'next', 'prev', 'start', 'end', or 'moves' to navigate"

        return True, message

    def navigate_to_move(self, move_index: int) -> tuple[bool, str]:
        if not self.pgn_mode:
            return False, "No PGN loaded. Use 'pgn <string>' first."

        if move_index < 0 or move_index > len(self.pgn_moves):
            return False, f"Invalid move number. Valid range: 0-{len(self.pgn_moves)}"

        self.board = chess.Board(self.initial_fen)
        self.move_history = []

        for i in range(move_index):
            move = self.pgn_moves[i]
            self.move_history.append(self.board.san(move))
            self.board.push(move)

        self.pgn_current_index = move_index

        if move_index == 0:
            message = "At starting position"
        else:
            last_move_san = self.move_history[-1]
            full_move_num = ((move_index - 1) // 2) + 1
            is_white_move = (move_index % 2) == 1
            move_notation = f"{full_move_num}.{'' if is_white_move else '..'}{last_move_san}"
            message = f"Position after move {move_index}: {move_notation}"

        return True, message

    def pgn_next(self) -> tuple[bool, str]:
        if not self.pgn_mode:
            return False, "No PGN loaded."

        if self.pgn_current_index >= len(self.pgn_moves):
            return False, "Already at end of game"

        return self.navigate_to_move(self.pgn_current_index + 1)

    def pgn_prev(self) -> tuple[bool, str]:
        if not self.pgn_mode:
            return False, "No PGN loaded."

        if self.pgn_current_index == 0:
            return False, "Already at start of game"

        return self.navigate_to_move(self.pgn_current_index - 1)

    def pgn_start(self) -> tuple[bool, str]:
        if not self.pgn_mode:
            return False, "No PGN loaded."
        return self.navigate_to_move(0)

    def pgn_end(self) -> tuple[bool, str]:
        if not self.pgn_mode:
            return False, "No PGN loaded."
        return self.navigate_to_move(len(self.pgn_moves))

    def get_pgn_moves_display(self) -> str:
        if not self.pgn_mode:
            return "No PGN loaded"

        lines = []
        temp_board = chess.Board(self.initial_fen)

        for i, move in enumerate(self.pgn_moves):
            san = temp_board.san(move)
            temp_board.push(move)

            if i % 2 == 0:
                move_num = (i // 2) + 1
                lines.append(f"{move_num}. {san}")
            else:
                lines[-1] += f" {san}"

            if i + 1 == self.pgn_current_index:
                lines.append("*")

        if self.pgn_current_index == len(self.pgn_moves):
            lines.append("*")

        return " ".join(lines)

    def exit_pgn_mode(self):
        self.pgn_mode = False
        self.pgn_game = None
        self.pgn_moves = []
        self.pgn_current_index = 0
