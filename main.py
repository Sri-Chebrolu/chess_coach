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
        score = f"mate in {m['mate']}" if m["mate"] else f"{m['score_cp']} cp"
        pv = " → ".join(m["pv"])
        lines.append(f"  {i}. {m['san']} ({score}) — line: {pv}")
    return "\n".join(lines)


def print_help():
    print("""
Commands:
  fen <FEN_STRING>   Load a new position
  analyze            Analyze the current position
  move <MOVE>        Test a move (e.g. 'move Nf3' or 'move g1f3')
  play <MOVE>        Play a move on the board (advances the game)
  undo               Undo the last played move
  board              Show the current board
  legal              List all legal moves
  ask <QUESTION>     Ask the coach a free-form question
  help               Show this help message
  quit               Exit
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
                top_moves = engine.analyze_position(board_state.board)
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
                top_moves = engine.analyze_position(board_state.board)
                user_eval = engine.evaluate_move(board_state.board, move)
                best = top_moves[0]
                delta = best["score_cp"] - (-user_eval["score_cp"])

                heuristics_before = extract_heuristics(board_state.board)
                temp_board = board_state.board.copy()
                temp_board.push(move)
                heuristics_after = extract_heuristics(temp_board)

                response = coach.compare_moves(
                    fen=board_state.board.fen(),
                    turn=board_state.turn,
                    best_move=best["san"], best_score=best["score_cp"],
                    user_move=board_state.board.san(move),
                    user_score=user_eval["score_cp"],
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
                undone = board_state.undo_move()
                if undone:
                    print(f"Undone: {undone}. {board_state.turn} to move.")
                    print(board_state.display())
                else:
                    print("Nothing to undo.")
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
