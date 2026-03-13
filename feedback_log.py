import logging
from datetime import datetime, UTC
from pathlib import Path


logger = logging.getLogger("chess_coach")

_FEEDBACK_LOG_PATH = Path(__file__).resolve().parent / "feedback.log"


def append_feedback_entry(
    *, request_id: str, session_id: str, feedback_text: str,
    current_fen: str = "", conversation: list[dict] = [],
) -> None:
    text = _format_entry(request_id, session_id, feedback_text, current_fen, conversation)
    try:
        _append_entry_to_file(text)
    except OSError as exc:
        logger.warning("Failed to write feedback log: %s", exc)


def _format_entry(
    request_id: str, session_id: str, feedback_text: str,
    current_fen: str, conversation: list[dict],
) -> str:
    sep = "=" * 80
    convo_lines = "\n".join(f"  [{m['role']}] {m['content']}" for m in conversation)
    return (
        f"{sep}\n"
        f"request_id:    {request_id}\n"
        f"timestamp:     {datetime.now(UTC).isoformat()}\n"
        f"session_id:    {session_id}\n"
        f"feedback_text: {feedback_text}\n"
        f"current_fen:   {current_fen}\n"
        f"conversation:\n{convo_lines}\n"
        f"{sep}\n\n"
    )


def _append_entry_to_file(text: str) -> None:
    with _FEEDBACK_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(text)
