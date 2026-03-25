import logging
from datetime import datetime, UTC
from pathlib import Path


logger = logging.getLogger("chess_coach")

_AUDIT_LOG_PATH = Path(__file__).resolve().parent / "llm_chat_payloads.log"


def append_chat_audit_entry(*, request_id: str, session_id: str, raw_user_message: str,
                            enriched_prompt: str) -> None:
    text = _format_entry(request_id, session_id, raw_user_message, enriched_prompt)
    try:
        _append_entry_to_file(text)
    except OSError as exc:
        logger.warning("Failed to write LLM audit log: %s", exc)


def _format_entry(request_id: str, session_id: str, raw_user_message: str,
                  enriched_prompt: str) -> str:
    sep = "=" * 80

    def indent(s: str) -> str:
        return "\n".join("  " + line for line in s.splitlines())

    return (
        f"{sep}\n"
        f"request_id:       {request_id}\n"
        f"timestamp:        {datetime.now(UTC).isoformat()}\n"
        f"session_id:       {session_id}\n"
        f"raw_user_message: {raw_user_message}\n"
        f"enriched_prompt:\n{indent(enriched_prompt)}\n"
        f"{sep}\n\n"
    )


def _append_entry_to_file(text: str) -> None:
    with _AUDIT_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(text)
