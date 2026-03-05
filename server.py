import uuid
import logging
import asyncio
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # Must be before any local imports that read env vars

import chess
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
        score = f"mate in {m['mate']}" if m["mate"] else f"{m['score_cp']} cp"
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
        {"san": m["san"], "score_cp": m["score_cp"], "mate": m["mate"], "pv": m["pv"]}
        for m in moves
    ]


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
    # Stop all active Stockfish processes on shutdown
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


class AnalyzeRequest(BaseModel):
    fen: str
    session_id: str | None = None
    pgn: str | None = None


class MoveRequest(BaseModel):
    session_id: str
    fen: str
    move: str  # SAN or UCI


class ChatRequest(BaseModel):
    session_id: str
    message: str
    fen: str


class PgnNavigateRequest(BaseModel):
    session_id: str
    action: str  # "goto" | "next" | "prev" | "start" | "end"
    move_index: int | None = None


class OpponentMoveRequest(BaseModel):
    session_id: str
    fen: str
    elo: int = 1500


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/api/validate")
async def validate(req: ValidateRequest, request: Request):
    request_id = str(uuid.uuid4())

    if not req.fen and not req.pgn:
        return err_response("EMPTY_INPUT", "Provide at least one of: fen, pgn.", request_id)

    bs = BoardState()
    pgn_metadata = None

    if req.pgn:
        success, message = bs.load_pgn(req.pgn)
        if not success:
            return err_response("INVALID_PGN", message, request_id)
        game = bs.pgn_game
        pgn_metadata = {
            "white": game.headers.get("White"),
            "black": game.headers.get("Black"),
            "event": game.headers.get("Event"),
            "total_half_moves": len(bs.pgn_moves),
            "fen_at_start": bs.initial_fen,
        }
    else:
        try:
            bs.load_fen(req.fen)
        except Exception as e:
            return err_response("INVALID_FEN", str(e), request_id)

    return ok_response({
        "valid": True,
        "fen": bs.board.fen(),
        "turn": bs.turn,
        "legal_moves": bs.get_legal_moves_san(),
        "pgn_metadata": pgn_metadata,
    }, request_id)


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, request: Request):
    request_id = str(uuid.uuid4())
    session_id, session = get_or_create_session(req.session_id)
    bs = session["board_state"]
    engine = session["engine"]
    coach = session["coach"]

    # Load position into session board state
    if req.pgn:
        success, message = bs.load_pgn(req.pgn)
        if not success:
            return err_response("INVALID_PGN", message, request_id)
    else:
        try:
            bs.load_fen(req.fen)
        except Exception as e:
            return err_response("INVALID_FEN", str(e), request_id)

    try:
        top_moves = engine.analyze_position(bs.board, num_moves=3)
    except Exception as e:
        logger.error("Engine error: %s", e)
        return err_response("ENGINE_TIMEOUT", str(e), request_id)

    heuristics = extract_heuristics(bs.board)
    top_moves_str = format_top_moves(top_moves)
    heuristics_str = format_heuristics_for_prompt(heuristics)

    try:
        coach_response = coach.analyze_position(
            fen=bs.board.fen(),
            turn=bs.turn,
            top_moves_str=top_moves_str,
            heuristics_str=heuristics_str,
        )
    except Exception as e:
        logger.error("LLM error: %s", e)
        return err_response("LLM_CONNECTION_ERROR", str(e), request_id)

    pgn_nav = None
    if bs.pgn_mode:
        pgn_nav = {
            "move_index": bs.pgn_current_index,
            "total_moves": len(bs.pgn_moves),
            "move_display": bs.get_pgn_moves_display(),
        }

    return ok_response({
        "session_id": session_id,
        "fen": bs.board.fen(),
        "turn": bs.turn,
        "top_moves": serialize_moves(top_moves),
        "heuristics": heuristics,
        "coach_response": coach_response,
        "pgn_nav": pgn_nav,
    }, request_id)


@app.post("/api/move")
async def move(req: MoveRequest, request: Request):
    request_id = str(uuid.uuid4())
    session = get_session(req.session_id)
    if not session:
        return err_response("SESSION_NOT_FOUND", "Session expired. Start a new analysis.", request_id, 404)

    bs = session["board_state"]
    engine = session["engine"]
    coach = session["coach"]

    try:
        bs.board = chess.Board(req.fen)
    except Exception as e:
        return err_response("INVALID_FEN", str(e), request_id)

    parsed_move = bs.validate_and_parse_move(req.move)
    if not parsed_move:
        return err_response("INVALID_MOVE", f"Illegal move: {req.move}", request_id)

    move_san = bs.board.san(parsed_move)

    try:
        top_moves = engine.analyze_position(bs.board, num_moves=3)
    except Exception as e:
        return err_response("ENGINE_TIMEOUT", str(e), request_id)

    heuristics_before = extract_heuristics(bs.board)

    # Evaluate user's move: analyze position after the move (consistent White perspective)
    board_after = bs.board.copy()
    board_after.push(parsed_move)
    try:
        user_move_analysis = engine.analyze_position(board_after, num_moves=1)
    except Exception as e:
        return err_response("ENGINE_TIMEOUT", str(e), request_id)

    heuristics_after = extract_heuristics(board_after)

    best = top_moves[0]
    user_score = user_move_analysis[0]["score_cp"] if user_move_analysis else 0
    best_score = best["score_cp"]
    # Both scores are from White's perspective (score.white() in engine.py)
    # delta: positive = user move improved White's position vs best, negative = worse
    delta = user_score - best_score

    try:
        coach_response = coach.compare_moves(
            fen=req.fen,
            turn=bs.turn,
            best_move=best["san"],
            best_score=best_score,
            user_move=move_san,
            user_score=user_score,
            delta=delta,
            top_moves_str=format_top_moves(top_moves),
            heuristics_before=format_heuristics_for_prompt(heuristics_before),
            heuristics_after=format_heuristics_for_prompt(heuristics_after),
        )
    except Exception as e:
        return err_response("LLM_CONNECTION_ERROR", str(e), request_id)

    # Advance session board state
    bs.push_move(parsed_move)

    return ok_response({
        "valid": True,
        "fen_after": bs.board.fen(),
        "turn_after": bs.turn,
        "user_move": {"san": move_san, "score_cp": user_score, "mate": user_move_analysis[0]["mate"] if user_move_analysis else None},
        "best_move": {"san": best["san"], "score_cp": best_score, "mate": best["mate"]},
        "delta_cp": delta,
        "top_moves": serialize_moves(top_moves),
        "heuristics_before": heuristics_before,
        "heuristics_after": heuristics_after,
        "coach_response": coach_response,
    }, request_id)


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


@app.post("/api/pgn/navigate")
async def pgn_navigate(req: PgnNavigateRequest, request: Request):
    request_id = str(uuid.uuid4())
    session = get_session(req.session_id)
    if not session:
        return err_response("SESSION_NOT_FOUND", "Session expired.", request_id, 404)

    bs = session["board_state"]
    if not bs.pgn_mode:
        return err_response("NO_PGN_LOADED", "No PGN loaded in this session.", request_id)

    action_map = {
        "next": bs.pgn_next,
        "prev": bs.pgn_prev,
        "start": bs.pgn_start,
        "end": bs.pgn_end,
    }

    if req.action == "goto":
        if req.move_index is None:
            return err_response("INVALID_MOVE_INDEX", "move_index required for goto.", request_id)
        success, message = bs.navigate_to_move(req.move_index)
    elif req.action in action_map:
        success, message = action_map[req.action]()
    else:
        return err_response("INVALID_MOVE_INDEX", f"Unknown action: {req.action}", request_id)

    if not success:
        return err_response("INVALID_MOVE_INDEX", message, request_id)

    return ok_response({
        "fen": bs.board.fen(),
        "turn": bs.turn,
        "move_index": bs.pgn_current_index,
        "total_moves": len(bs.pgn_moves),
        "last_move_san": bs.move_history[-1] if bs.move_history else None,
        "move_display": bs.get_pgn_moves_display(),
        "legal_moves": bs.get_legal_moves_san(),
    }, request_id)


@app.post("/api/opponent-move")
async def opponent_move(req: OpponentMoveRequest, request: Request):
    request_id = str(uuid.uuid4())
    session = get_session(req.session_id)
    if not session:
        return err_response("SESSION_NOT_FOUND", "Session expired.", request_id, 404)

    bs = session["board_state"]
    engine = session["engine"]

    try:
        bs.board = chess.Board(req.fen)
    except Exception as e:
        return err_response("INVALID_FEN", str(e), request_id)

    try:
        move_data = engine.get_opponent_move(bs.board, req.elo)
    except Exception as e:
        return err_response("ENGINE_ERROR", str(e), request_id)

    parsed = chess.Move.from_uci(move_data["uci"])
    bs.push_move(parsed)

    try:
        top_moves = engine.analyze_position(bs.board, num_moves=3)
    except Exception as e:
        return err_response("ENGINE_TIMEOUT", str(e), request_id)

    return ok_response({
        "opponent_move": move_data,
        "fen_after": bs.board.fen(),
        "turn_after": bs.turn,
        "top_moves": serialize_moves(top_moves),
    }, request_id)
