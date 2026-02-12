import chess

PIECE_VALUES = {
    chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
    chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0,
}

CENTER_SQUARES = [chess.D4, chess.D5, chess.E4, chess.E5]


def extract_heuristics(board: chess.Board) -> dict:
    """Extract all positional/tactical features from the board."""
    return {
        "material": _material_balance(board),
        "center_control": _center_control(board),
        "piece_activity": _piece_activity(board),
        "king_safety": _king_safety(board),
        "pawn_structure": _pawn_structure(board),
        "tactics": _tactical_motifs(board),
        "development": _development(board),
    }


def _material_balance(board: chess.Board) -> dict:
    white_material = sum(
        len(board.pieces(pt, chess.WHITE)) * val
        for pt, val in PIECE_VALUES.items()
    )
    black_material = sum(
        len(board.pieces(pt, chess.BLACK)) * val
        for pt, val in PIECE_VALUES.items()
    )
    return {
        "white": white_material,
        "black": black_material,
        "balance": white_material - black_material,
        "description": f"White: {white_material} pts, Black: {black_material} pts (balance: {white_material - black_material:+d})",
    }


def _center_control(board: chess.Board) -> dict:
    white_center = sum(
        1 for sq in CENTER_SQUARES
        if board.is_attacked_by(chess.WHITE, sq)
    )
    black_center = sum(
        1 for sq in CENTER_SQUARES
        if board.is_attacked_by(chess.BLACK, sq)
    )
    return {
        "white_controls": white_center,
        "black_controls": black_center,
        "description": f"Center control — White: {white_center}/4, Black: {black_center}/4",
    }


def _piece_activity(board: chess.Board) -> dict:
    """Count squares attacked per side as a proxy for piece activity."""
    white_attacks = 0
    black_attacks = 0
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece:
            attacks = len(board.attacks(sq))
            if piece.color == chess.WHITE:
                white_attacks += attacks
            else:
                black_attacks += attacks
    return {
        "white_activity": white_attacks,
        "black_activity": black_attacks,
        "description": f"Piece activity (squares attacked) — White: {white_attacks}, Black: {black_attacks}",
    }


def _king_safety(board: chess.Board) -> dict:
    results = {}
    for color, name in [(chess.WHITE, "white"), (chess.BLACK, "black")]:
        king_sq = board.king(color)
        attackers = board.attackers(not color, king_sq)
        is_castled = not board.has_castling_rights(color)
        shield_pawns = 0
        if king_sq is not None:
            direction = 8 if color == chess.WHITE else -8
            for offset in [direction - 1, direction, direction + 1]:
                sq = king_sq + offset
                if 0 <= sq <= 63:
                    piece = board.piece_at(sq)
                    if piece and piece.piece_type == chess.PAWN and piece.color == color:
                        shield_pawns += 1
        results[name] = {
            "attackers": len(attackers),
            "in_check": board.is_check() and board.turn == color,
            "castled": is_castled,
            "pawn_shield": shield_pawns,
        }
    return results


def _pawn_structure(board: chess.Board) -> dict:
    issues = {"white": [], "black": []}
    for color, name in [(chess.WHITE, "white"), (chess.BLACK, "black")]:
        pawns = board.pieces(chess.PAWN, color)
        files_with_pawns = [chess.square_file(sq) for sq in pawns]
        for f in range(8):
            if files_with_pawns.count(f) > 1:
                issues[name].append(f"doubled pawns on {chess.FILE_NAMES[f]}-file")
        for f in set(files_with_pawns):
            adjacent = [f - 1, f + 1]
            if not any(af in files_with_pawns for af in adjacent if 0 <= af <= 7):
                issues[name].append(f"isolated pawn on {chess.FILE_NAMES[f]}-file")
    return issues


def _tactical_motifs(board: chess.Board) -> list[str]:
    motifs = []
    if board.is_check():
        motifs.append("King is in CHECK")
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece and piece.piece_type != chess.KING:
            enemy = not piece.color
            if board.is_attacked_by(enemy, sq) and not board.is_attacked_by(piece.color, sq):
                motifs.append(
                    f"HANGING: {piece.symbol()} on {chess.square_name(sq)} "
                    f"is attacked but undefended"
                )
    return motifs


def _development(board: chess.Board) -> dict:
    """Check if knights and bishops have moved from starting squares."""
    undeveloped = {"white": [], "black": []}
    start_positions = {
        chess.WHITE: {chess.B1: "Nb1", chess.G1: "Ng1", chess.C1: "Bc1", chess.F1: "Bf1"},
        chess.BLACK: {chess.B8: "Nb8", chess.G8: "Ng8", chess.C8: "Bc8", chess.F8: "Bf8"},
    }
    for color, positions in start_positions.items():
        name = "white" if color == chess.WHITE else "black"
        for sq, label in positions.items():
            piece = board.piece_at(sq)
            if piece and piece.color == color:
                undeveloped[name].append(label)
    return undeveloped


def format_heuristics_for_prompt(heuristics: dict) -> str:
    """Convert heuristics dict into a readable string for the LLM prompt."""
    lines = []
    lines.append(f"MATERIAL: {heuristics['material']['description']}")
    lines.append(f"CENTER: {heuristics['center_control']['description']}")
    lines.append(f"ACTIVITY: {heuristics['piece_activity']['description']}")

    for color in ["white", "black"]:
        ks = heuristics["king_safety"][color]
        status = "castled" if ks["castled"] else "uncastled"
        lines.append(
            f"KING SAFETY ({color}): {status}, "
            f"{ks['pawn_shield']} shield pawns, "
            f"{ks['attackers']} attackers"
        )

    for color in ["white", "black"]:
        if heuristics["pawn_structure"][color]:
            lines.append(f"PAWN ISSUES ({color}): {', '.join(heuristics['pawn_structure'][color])}")

    for color in ["white", "black"]:
        if heuristics["development"][color]:
            lines.append(f"UNDEVELOPED ({color}): {', '.join(heuristics['development'][color])}")

    if heuristics["tactics"]:
        lines.append(f"TACTICS: {'; '.join(heuristics['tactics'])}")

    return "\n".join(lines)
