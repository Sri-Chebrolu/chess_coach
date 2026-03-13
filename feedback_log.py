import logging
from datetime import datetime, UTC
from pathlib import Path


logger = logging.getLogger("chess_coach")

_FEEDBACK_LOG_PATH = Path(__file__).resolve().parent / "feedback.log"


def append_feedback_entry(*, request_id: str, session_id: str, feedback_text: str) -> None:
    text = _format_entry(request_id, session_id, feedback_text)
    try:
        _append_entry_to_file(text)
    except OSError as exc:
        logger.warning("Failed to write feedback log: %s", exc)


def _format_entry(request_id: str, session_id: str, feedback_text: str) -> str:
    sep = "=" * 80
    return (
        f"{sep}\n"
        f"request_id:    {request_id}\n"
        f"timestamp:     {datetime.now(UTC).isoformat()}\n"
        f"session_id:    {session_id}\n"
        f"feedback_text: {feedback_text}\n"
        f"{sep}\n\n"
    )


def _append_entry_to_file(text: str) -> None:
    with _FEEDBACK_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(text)
