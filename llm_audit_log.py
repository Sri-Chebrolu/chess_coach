import json
import logging
import os
from copy import deepcopy
from datetime import datetime, UTC
from pathlib import Path


logger = logging.getLogger("chess_coach")

_AUDIT_LOG_PATH = Path(__file__).resolve().parent / "llm_chat_payloads.json"


class AuditLogError(Exception):
    """Raised when the audit log cannot be safely read or written."""


def append_chat_audit_entry(*, request_id: str, session_id: str, raw_user_message: str,
                            enriched_prompt: str, llm_request: dict) -> None:
    entry = {
        "request_id": request_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "session_id": session_id,
        "raw_user_message": raw_user_message,
        "enriched_prompt": enriched_prompt,
        "llm_request": deepcopy(llm_request),
    }

    payload = _read_or_initialize()
    payload["entries"].append(entry)
    _write_payload(payload)


def _read_or_initialize() -> dict:
    if not _AUDIT_LOG_PATH.exists():
        return {"entries": []}

    try:
        with _AUDIT_LOG_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except json.JSONDecodeError as exc:
        logger.error("Malformed LLM audit log at %s: %s", _AUDIT_LOG_PATH, exc)
        raise AuditLogError("Malformed audit log file.") from exc
    except OSError as exc:
        logger.error("Failed to read LLM audit log at %s: %s", _AUDIT_LOG_PATH, exc)
        raise AuditLogError("Failed to read audit log file.") from exc

    if not isinstance(payload, dict) or not isinstance(payload.get("entries"), list):
        logger.error("Invalid LLM audit log shape at %s", _AUDIT_LOG_PATH)
        raise AuditLogError("Invalid audit log file structure.")

    return payload


def _write_payload(payload: dict) -> None:
    tmp_path = _AUDIT_LOG_PATH.with_suffix(".json.tmp")
    try:
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, _AUDIT_LOG_PATH)
    except OSError as exc:
        logger.error("Failed to write LLM audit log at %s: %s", _AUDIT_LOG_PATH, exc)
        raise AuditLogError("Failed to write audit log file.") from exc
    finally:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass
