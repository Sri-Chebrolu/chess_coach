import uuid
import asyncio
import logging
from datetime import datetime, timedelta

from dotenv import load_dotenv

load_dotenv()

from board_state import BoardState
from engine import EngineAnalysis
from coach import Coach

logger = logging.getLogger("chess_coach")

sessions: dict[str, dict] = {}

TTL_MINUTES = 30
CLEANUP_INTERVAL_SECONDS = 300  # 5 minutes


def get_or_create_session(session_id: str | None) -> tuple[str, dict]:
    if session_id and session_id in sessions:
        session = sessions[session_id]
        session["last_active"] = datetime.utcnow()
        return session_id, session

    new_id = str(uuid.uuid4())
    engine = EngineAnalysis()
    engine.start()
    sessions[new_id] = {
        "coach": Coach(),
        "board_state": BoardState(),
        "engine": engine,
        "created_at": datetime.utcnow(),
        "last_active": datetime.utcnow(),
    }
    logger.info("Created session %s", new_id)
    return new_id, sessions[new_id]


def get_session(session_id: str) -> dict | None:
    session = sessions.get(session_id)
    if session:
        session["last_active"] = datetime.utcnow()
    return session


async def cleanup_sessions():
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        cutoff = datetime.utcnow() - timedelta(minutes=TTL_MINUTES)
        expired = [sid for sid, s in sessions.items() if s["last_active"] < cutoff]
        for sid in expired:
            try:
                sessions[sid]["engine"].stop()
            except Exception:
                pass
            del sessions[sid]
            logger.info("Expired session %s", sid)
