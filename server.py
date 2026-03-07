import uuid
import logging
import asyncio
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # Must be before any local imports that read env vars

import json as json_module
import chess
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

from board_state import BoardState
from heuristics import extract_heuristics, format_heuristics_for_prompt
import sessions as session_store
from sessions import get_or_create_session, get_session, cleanup_sessions

logging.basicConfig(
    filename="chess_coach.log",
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("chess_coach")


# ─── Helpers ─────────────────────────────────────────────────────────────────

def format_top_moves(moves: list[dict]) -> str:
    lines = []
    for i, m in enumerate(moves, 1):
        score = f"mate in {m['mate']}" if m["mate"] else f"{m['score_cp_white']} cp"
        pv = " → ".join(m["pv"])
        lines.append(f"  {i}. {m['san']} ({score}) — line: {pv}")
    return "\n".join(lines)


def enrich_message(user_message: str, fen: str) -> str:
    board = chess.Board(fen)
    heuristics = extract_heuristics(board)
    heuristics_str = format_heuristics_for_prompt(heuristics)
    return (
        f"=== CURRENT BOARD STATE (Ground Truth) ===\n"
        f"FEN: {fen}\n"
        f"Side to move: {'White' if board.turn else 'Black'}\n\n"
        f"POSITIONAL FEATURES:\n{heuristics_str}\n\n"
        f"=== STUDENT'S QUESTION ===\n"
        f"{user_message}"
    )


def serialize_moves(moves: list[dict]) -> list[dict]:
    """Strip chess.Move objects — only keep JSON-serializable fields."""
    return [
        {
            "san": m["san"],
            "uci": m["uci"],
            "from_square": m["from_square"],
            "to_square": m["to_square"],
            "score_cp_white": m["score_cp_white"],
            "mate": m["mate"],
            "pv": m["pv"],
        }
        for m in moves
    ]


def build_position(fen: str, move_index: int, source_kind: str) -> dict:
    board = chess.Board(fen)
    return {
        "fen": fen,
        "turn": "White" if board.turn == chess.WHITE else "Black",
        "move_index": move_index,
        "source_kind": source_kind,
    }


def ok_response(data: dict, request_id: str) -> dict:
    return {"ok": True, "data": data, "error": None, "request_id": request_id}


def err_response(code: str, message: str, request_id: str, status: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"ok": False, "data": None, "error": {"code": code, "message": message}, "request_id": request_id},
        headers={"X-Request-Id": request_id},
    )


# ─── App lifecycle ────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(cleanup_sessions())
    yield
    task.cancel()
    for sid, session in list(session_store.sessions.items()):
        try:
            session["engine"].stop()
        except Exception:
            pass


app = FastAPI(title="Chess Coach API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ─── Request models ───────────────────────────────────────────────────────────

class ValidateRequest(BaseModel):
    fen: str | None = None
    pgn: str | None = None


class SessionInitRequest(BaseModel):
    source_kind: str  # "fen" | "pgn"
    fen: str | None = None
    pgn: str | None = None


class AnalyzeRequest(BaseModel):
    session_id: str
    fen: str


class MoveRequest(BaseModel):
    session_id: str
    fen_before: str
    move: str  # SAN or UCI
    position_context: dict | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str
    fen: str


class OpponentMoveRequest(BaseModel):
    session_id: str
    fen: str
    elo: int = 1500


class CoachAnalyzeRequest(BaseModel):
    session_id: str
    fen_before: str
    fen_after: str
    move_result: dict
    analysis_before: dict | None = None
    analysis_after: dict | None = None


class CoachPositionRequest(BaseModel):
    session_id: str
    fen: str
    analysis_context: dict | None = None


BEST_MOVE_THRESHOLD = 30  # centipawns


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/api/validate")
async def validate(req: ValidateRequest, request: Request):
    request_id = str(uuid.uuid4())

    if not req.fen and not req.pgn:
        return err_response("EMPTY_INPUT", "Provide at least one of: fen, pgn.", request_id)

    bs = BoardState()
    pgn_metadata = None
    source_kind = "fen"

    if req.pgn:
        success, message = bs.load_pgn(req.pgn)
        if not success:
            return err_response("INVALID_PGN", message, request_id)
        source_kind = "pgn"
        game = bs.pgn_game
        pgn_metadata = {
            "white": game.headers.get("White"),
            "black": game.headers.get("Black"),
            "event": game.headers.get("Event"),
            "total_half_moves": len(bs.pgn_moves),
            "start_fen": bs.initial_fen,
        }
    else:
        try:
            bs.load_fen(req.fen)
        except Exception as e:
            return err_response("INVALID_FEN", str(e), request_id)

    return ok_response({
        "source_kind": source_kind,
        "canonical_start_fen": bs.board.fen(),
        "turn": bs.turn,
        "legal_moves": bs.get_legal_moves_san(),
        "pgn_metadata": pgn_metadata,
    }, request_id)


@app.post("/api/session/init")
async def session_init(req: SessionInitRequest, request: Request):
    request_id = str(uuid.uuid4())

    session_id, session = get_or_create_session(None)
    bs = session["board_state"]

    if req.source_kind == "pgn":
        if not req.pgn:
            return err_response("MISSING_PGN", "pgn field required for source_kind=pgn.", request_id)
        success, message = bs.load_pgn(req.pgn)
        if not success:
            return err_response("INVALID_PGN", message, request_id)
        timeline_entries = bs.build_timeline(req.pgn)
        game = bs.pgn_game
        pgn_metadata = {
            "white": game.headers.get("White"),
            "black": game.headers.get("Black"),
            "event": game.headers.get("Event"),
            "total_half_moves": len(bs.pgn_moves),
            "start_fen": bs.initial_fen,
        }
    else:
        fen = req.fen or chess.STARTING_FEN
        try:
            bs.load_fen(fen)
        except Exception as e:
            return err_response("INVALID_FEN", str(e), request_id)
        timeline_entries = bs.build_initial_timeline(fen)
        pgn_metadata = None

    # Store source_kind on the session for later use
    session["source_kind"] = req.source_kind

    initial_position = build_position(
        fen=bs.board.fen(),
        move_index=0,
        source_kind=req.source_kind,
    )

    return ok_response({
        "session_id": session_id,
        "source_kind": req.source_kind,
        "initial_position": initial_position,
        "timeline": {
            "entries": timeline_entries,
            "current_index": 0,
            "navigation_mode": "timeline",
        },
        "pgn_metadata": pgn_metadata,
        "session_capabilities": {"opponent_mode": True},
    }, request_id)


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, request: Request):
    """Pure read — engine analysis of a position. No session mutation."""
    request_id = str(uuid.uuid4())
    session = get_session(req.session_id)
    if not session:
        return err_response("SESSION_NOT_FOUND", "Session expired. Start a new analysis.", request_id, 404)

    engine = session["engine"]
    source_kind = session.get("source_kind", "fen")

    try:
        board = chess.Board(req.fen)
    except Exception as e:
        return err_response("INVALID_FEN", str(e), request_id)

    try:
        result = engine.analyze_position(board, num_moves=3)
    except Exception as e:
        logger.error("Engine error: %s", e)
        return err_response("ENGINE_TIMEOUT", str(e), request_id)

    heuristics = extract_heuristics(board)

    return ok_response({
        "position": build_position(req.fen, 0, source_kind),
        "analysis": {
            "top_moves": serialize_moves(result["top_moves"]),
            "heuristics": heuristics,
            "score_semantics": result["score_semantics"],
        },
    }, request_id)


@app.post("/api/move")
async def move(req: MoveRequest, request: Request):
    """Synchronous JSON endpoint — execute a move and return structured result."""
    request_id = str(uuid.uuid4())
    session = get_session(req.session_id)
    if not session:
        return err_response("SESSION_NOT_FOUND", "Session expired. Start a new analysis.", request_id, 404)

    bs = session["board_state"]
    engine = session["engine"]
    source_kind = session.get("source_kind", "fen")

    try:
        board_before = chess.Board(req.fen_before)
    except Exception as e:
        return err_response("INVALID_FEN", str(e), request_id)

    # Validate move
    bs.board = board_before.copy()
    parsed_move = bs.validate_and_parse_move(req.move)
    if not parsed_move:
        return err_response("INVALID_MOVE", f"Illegal move: {req.move}", request_id)

    move_san = board_before.san(parsed_move)
    move_uci = parsed_move.uci()
    from_sq = chess.square_name(parsed_move.from_square)
    to_sq = chess.square_name(parsed_move.to_square)
    promotion = None
    if parsed_move.promotion:
        promotion = chess.piece_name(parsed_move.promotion)

    # Analyze position before move
    try:
        result_before = engine.analyze_position(board_before, num_moves=3)
    except Exception as e:
        return err_response("ENGINE_TIMEOUT", str(e), request_id)

    # Execute move
    board_after = board_before.copy()
    board_after.push(parsed_move)

    # Analyze position after move
    try:
        result_after = engine.analyze_position(board_after, num_moves=3)
    except Exception as e:
        return err_response("ENGINE_TIMEOUT", str(e), request_id)

    # Evaluate user's move (analyze the position after user's move)
    try:
        user_move_eval = engine.evaluate_move(board_before, parsed_move)
    except Exception as e:
        return err_response("ENGINE_TIMEOUT", str(e), request_id)

    best = result_before["top_moves"][0]
    user_eval_white = user_move_eval["score_cp_white"]
    best_eval_white = best["score_cp_white"]
    delta_cp_white = user_eval_white - best_eval_white

    is_best = abs(delta_cp_white) <= BEST_MOVE_THRESHOLD

    # Advance session board state
    bs.board = board_before.copy()
    bs.push_move(parsed_move)

    # Determine move_index from session board state
    move_index = len(bs.move_history)

    # Build timeline update
    fen_after = board_after.fen()
    turn_after = "White" if board_after.turn == chess.WHITE else "Black"
    move_number_label = BoardState._move_number_label(move_index)

    timeline_entry = {
        "index": move_index,
        "fen": fen_after,
        "turn": turn_after,
        "san": move_san,
        "move_number_label": move_number_label,
        "source": "live_play",
    }

    position_before = build_position(req.fen_before, move_index - 1, source_kind)
    position_after = build_position(fen_after, move_index, source_kind)

    return ok_response({
        "position_before": position_before,
        "position_after": position_after,
        "move_result": {
            "move_san": move_san,
            "move_uci": move_uci,
            "from_square": from_sq,
            "to_square": to_sq,
            "promotion": promotion,
            "is_legal": True,
            "is_best_move": is_best,
            "user_move_eval_white": user_eval_white,
            "best_move_eval_white": best_eval_white,
            "delta_cp_white": delta_cp_white,
        },
        "analysis_after": {
            "top_moves": serialize_moves(result_after["top_moves"]),
            "heuristics": extract_heuristics(board_after),
            "score_semantics": result_after["score_semantics"],
        },
        "timeline_update": {
            "mode": "append",
            "entries": [timeline_entry],
            "new_current_index": move_index,
        },
    }, request_id)


@app.post("/api/opponent-move")
async def opponent_move(req: OpponentMoveRequest, request: Request):
    request_id = str(uuid.uuid4())
    session = get_session(req.session_id)
    if not session:
        return err_response("SESSION_NOT_FOUND", "Session expired.", request_id, 404)

    bs = session["board_state"]
    engine = session["engine"]
    source_kind = session.get("source_kind", "fen")

    try:
        board_before = chess.Board(req.fen)
    except Exception as e:
        return err_response("INVALID_FEN", str(e), request_id)

    try:
        move_data = engine.get_opponent_move(board_before, req.elo)
    except Exception as e:
        return err_response("ENGINE_ERROR", str(e), request_id)

    parsed = chess.Move.from_uci(move_data["uci"])

    # Execute move
    board_after = board_before.copy()
    board_after.push(parsed)

    # Advance session board state
    bs.board = board_before.copy()
    bs.push_move(parsed)

    move_index = len(bs.move_history)

    # Analyze position after opponent move
    try:
        result_after = engine.analyze_position(board_after, num_moves=3)
    except Exception as e:
        return err_response("ENGINE_TIMEOUT", str(e), request_id)

    fen_after = board_after.fen()
    turn_after = "White" if board_after.turn == chess.WHITE else "Black"
    move_number_label = BoardState._move_number_label(move_index)

    timeline_entry = {
        "index": move_index,
        "fen": fen_after,
        "turn": turn_after,
        "san": move_data["san"],
        "move_number_label": move_number_label,
        "source": "opponent_play",
    }

    position_before = build_position(req.fen, move_index - 1, source_kind)
    position_after = build_position(fen_after, move_index, source_kind)

    return ok_response({
        "position_before": position_before,
        "position_after": position_after,
        "opponent_move": move_data,
        "analysis_after": {
            "top_moves": serialize_moves(result_after["top_moves"]),
            "heuristics": extract_heuristics(board_after),
            "score_semantics": result_after["score_semantics"],
        },
        "timeline_update": {
            "mode": "append",
            "entries": [timeline_entry],
            "new_current_index": move_index,
        },
    }, request_id)


@app.post("/api/coach/coach-analyze")
async def coach_analyze(req: CoachAnalyzeRequest, request: Request):
    """SSE endpoint for coach commentary on a move."""
    request_id = str(uuid.uuid4())
    session = get_session(req.session_id)
    if not session:
        return err_response("SESSION_NOT_FOUND", "Session expired.", request_id, 404)

    coach = session["coach"]
    engine = session["engine"]
    mr = req.move_result

    is_best = mr.get("is_best_move", False)

    async def event_generator():
        yield {"event": "start", "data": "{}"}

        if is_best:
            yield {"event": "skip", "data": json_module.dumps({"reason": "best_move"})}
        else:
            try:
                # Get heuristics for context
                board_before = chess.Board(req.fen_before)
                board_after = chess.Board(req.fen_after)
                heuristics_before = format_heuristics_for_prompt(extract_heuristics(board_before))
                heuristics_after = format_heuristics_for_prompt(extract_heuristics(board_after))

                # If analysis not provided, compute top moves for prompt
                if req.analysis_before and "top_moves" in req.analysis_before:
                    top_moves_str = format_top_moves(req.analysis_before["top_moves"])
                else:
                    result = engine.analyze_position(board_before, num_moves=3)
                    top_moves_str = format_top_moves(result["top_moves"])

                for chunk in coach.compare_moves_stream(
                    fen=req.fen_before,
                    turn="White" if board_before.turn == chess.WHITE else "Black",
                    best_move=mr.get("best_move_san", ""),
                    best_score=mr.get("best_move_eval_white", 0),
                    user_move=mr.get("move_san", ""),
                    user_score=mr.get("user_move_eval_white", 0),
                    delta=mr.get("delta_cp_white", 0),
                    top_moves_str=top_moves_str,
                    heuristics_before=heuristics_before,
                    heuristics_after=heuristics_after,
                ):
                    yield {"event": "token", "data": json_module.dumps({"token": chunk})}
            except Exception as e:
                logger.error("Coach streaming error: %s", e)
                yield {"event": "error", "data": json_module.dumps({"message": str(e)})}

        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_generator())


@app.post("/api/coach/analyze-position")
async def coach_analyze_position(req: CoachPositionRequest, request: Request):
    """SSE endpoint for coach analysis of a position."""
    request_id = str(uuid.uuid4())
    session = get_session(req.session_id)
    if not session:
        return err_response("SESSION_NOT_FOUND", "Session expired.", request_id, 404)

    coach = session["coach"]
    engine = session["engine"]

    try:
        board = chess.Board(req.fen)
    except Exception as e:
        return err_response("INVALID_FEN", str(e), request_id)

    async def event_generator():
        yield {"event": "start", "data": "{}"}

        try:
            result = engine.analyze_position(board, num_moves=3)
            top_moves_str = format_top_moves(result["top_moves"])
            heuristics_str = format_heuristics_for_prompt(extract_heuristics(board))
            turn = "White" if board.turn == chess.WHITE else "Black"

            for chunk in coach.analyze_position_stream(
                fen=req.fen,
                turn=turn,
                top_moves_str=top_moves_str,
                heuristics_str=heuristics_str,
            ):
                yield {"event": "token", "data": json_module.dumps({"token": chunk})}
        except Exception as e:
            logger.error("Coach position analysis error: %s", e)
            yield {"event": "error", "data": json_module.dumps({"message": str(e)})}

        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_generator())


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    request_id = str(uuid.uuid4())

    if not req.message.strip():
        return err_response("EMPTY_MESSAGE", "Message cannot be empty.", request_id)

    session = get_session(req.session_id)
    if not session:
        return err_response("SESSION_NOT_FOUND", "Session expired.", request_id, 404)

    try:
        enriched = enrich_message(req.message, req.fen)
    except Exception as e:
        return err_response("INVALID_FEN", str(e), request_id)

    try:
        response = session["coach"].followup(enriched)
    except Exception as e:
        return err_response("LLM_CONNECTION_ERROR", str(e), request_id)

    return ok_response({"response": response}, request_id)
