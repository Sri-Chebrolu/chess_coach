import logging
from board_state import BoardState
from engine import EngineAnalysis
from heuristics import extract_heuristics, format_heuristics_for_prompt
from coach import Coach

logging.basicConfig(
    filename="chess_coach.log",
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def format_top_moves(moves: list[dict]) -> str:
    lines = []
    for i, m in enumerate(moves, 1):
        score = f"mate in {m['mate']}" if m["mate"] else f"{m['score_cp_white']} cp"
        pv = " → ".join(m["pv"])
        lines.append(f"  {i}. {m['san']} ({score}) — line: {pv}")
    return "\n".join(lines)


def print_help():
    print("""
Commands:
  fen <FEN_STRING>      Load a new position from FEN notation
  pgn <PGN_STRING>      Load a PGN game for navigation (inline string)
  loadpgn <filepath>    Load a PGN game from file

  PGN Navigation (available after loading a PGN):
    goto <N>            Jump to half-move N (0=start, 1=after 1st move, etc.)
    next                Advance one half-move forward
    prev                Go back one half-move
    start               Jump to starting position
    end                 Jump to final position
    moves               Show all moves with current position marker

  analyze               Analyze the current position with Stockfish
  move <MOVE>           Test a move without playing it (e.g. 'move Nf3')
  play <MOVE>           Play a move and advance the game (e.g. 'play e4')
  undo                  Undo the last played move (not available in PGN mode)
  board                 Show the current board position
  legal                 List all legal moves in current position
  ask <QUESTION>        Ask the coach a free-form question
  help                  Show this help message
  quit                  Exit the chess coach
""")


def main():
    board_state = BoardState()
    engine = EngineAnalysis()
    coach = Coach()

    engine.start()
    print("=== AI Chess Coach ===")
    print("Type 'help' for commands, or 'fen <string>' to load a position.\n")

    try:
        while True:
            try:
                user_input = input("chess> ").strip()
            except EOFError:
                break
            if not user_input:
                continue

            parts = user_input.split(maxsplit=1)
            command = parts[0].lower()
            arg = parts[1] if len(parts) > 1 else ""

            if command == "quit":
                break
            elif command == "help":
                print_help()
            elif command == "fen":
                try:
                    board_state.load_fen(arg)
                    print(f"Position loaded. {board_state.turn} to move.")
                    print(board_state.display())
                except Exception as e:
                    print(f"Invalid FEN: {e}")
            elif command == "board":
                print(board_state.display())
                print(f"\nFEN: {board_state.board.fen()}")
                print(f"{board_state.turn} to move.")
            elif command == "legal":
                print(", ".join(board_state.get_legal_moves_san()))
            elif command == "analyze":
                print("Analyzing position...")
                result = engine.analyze_position(board_state.board)
                top_moves = result["top_moves"]
                heuristics = extract_heuristics(board_state.board)
                response = coach.analyze_position(
                    fen=board_state.board.fen(),
                    turn=board_state.turn,
                    top_moves_str=format_top_moves(top_moves),
                    heuristics_str=format_heuristics_for_prompt(heuristics),
                )
                print(f"\n{response}\n")
            elif command == "move":
                move = board_state.validate_and_parse_move(arg)
                if not move:
                    print(f"Invalid or illegal move: '{arg}'")
                    print(f"Legal moves: {', '.join(board_state.get_legal_moves_san())}")
                    continue

                print(f"Evaluating {board_state.board.san(move)}...")
                result = engine.analyze_position(board_state.board)
                top_moves = result["top_moves"]
                user_eval = engine.evaluate_move(board_state.board, move)
                best = top_moves[0]
                delta = best["score_cp_white"] - (-user_eval["score_cp_white"])

                heuristics_before = extract_heuristics(board_state.board)
                temp_board = board_state.board.copy()
                temp_board.push(move)
                heuristics_after = extract_heuristics(temp_board)

                response = coach.compare_moves(
                    fen=board_state.board.fen(),
                    turn=board_state.turn,
                    best_move=best["san"], best_score=best["score_cp_white"],
                    user_move=board_state.board.san(move),
                    user_score=user_eval["score_cp_white"],
                    delta=delta,
                    top_moves_str=format_top_moves(top_moves),
                    heuristics_before=format_heuristics_for_prompt(heuristics_before),
                    heuristics_after=format_heuristics_for_prompt(heuristics_after),
                )
                print(f"\n{response}\n")
            elif command == "play":
                move = board_state.validate_and_parse_move(arg)
                if not move:
                    print(f"Invalid or illegal move: '{arg}'")
                    continue
                san = board_state.board.san(move)
                board_state.push_move(move)
                print(f"Played {san}. {board_state.turn} to move.")
                print(board_state.display())
            elif command == "undo":
                if board_state.pgn_mode:
                    print("Cannot undo in PGN navigation mode. Use 'prev' to go back.")
                    continue
                undone = board_state.undo_move()
                if undone:
                    print(f"Undone: {undone}. {board_state.turn} to move.")
                    print(board_state.display())
                else:
                    print("Nothing to undo.")
            elif command == "pgn":
                if not arg:
                    print("Usage: pgn <PGN_STRING>")
                    print("Example: pgn 1. e4 e5 2. Nf3 Nc6 3. Bb5")
                    continue
                success, message = board_state.load_pgn(arg)
                print(message)
                if success:
                    print(board_state.display())
            elif command == "loadpgn":
                if not arg:
                    print("Usage: loadpgn <filepath>")
                    print("Example: loadpgn game.pgn")
                    print("Example: loadpgn ~/chess/kasparov_deep_blue.pgn")
                    continue
                success, message = board_state.load_pgn_file(arg)
                print(message)
                if success:
                    print(board_state.display())
            elif command == "goto":
                if not arg:
                    print("Usage: goto <move_number>")
                    print("Example: goto 5 (jumps to position after 5th half-move)")
                    continue
                try:
                    move_num = int(arg)
                    success, message = board_state.navigate_to_move(move_num)
                    print(message)
                    if success:
                        print(board_state.display())
                        print(f"\nFEN: {board_state.board.fen()}")
                except ValueError:
                    print(f"Invalid move number: '{arg}'")
            elif command == "next":
                success, message = board_state.pgn_next()
                print(message)
                if success:
                    print(board_state.display())
                    print(f"\nFEN: {board_state.board.fen()}")
            elif command == "prev":
                success, message = board_state.pgn_prev()
                print(message)
                if success:
                    print(board_state.display())
                    print(f"\nFEN: {board_state.board.fen()}")
            elif command == "start":
                success, message = board_state.pgn_start()
                print(message)
                if success:
                    print(board_state.display())
                    print(f"\nFEN: {board_state.board.fen()}")
            elif command == "end":
                success, message = board_state.pgn_end()
                print(message)
                if success:
                    print(board_state.display())
                    print(f"\nFEN: {board_state.board.fen()}")
            elif command == "moves":
                if not board_state.pgn_mode:
                    print("No PGN loaded. Use 'pgn <string>' first.")
                else:
                    print(board_state.get_pgn_moves_display())
            elif command == "ask":
                if not arg:
                    print("Usage: ask <your question>")
                    continue
                response = coach.followup(arg)
                print(f"\n{response}\n")
            else:
                print(f"Unknown command: '{command}'. Type 'help' for commands.")
    finally:
        engine.stop()
        print("Goodbye!")


if __name__ == "__main__":
    main()
