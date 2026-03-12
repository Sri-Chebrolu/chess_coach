import time
import logging
import anthropic
from dotenv import load_dotenv

from llm_audit_log import append_chat_audit_entry

load_dotenv()

logger = logging.getLogger("chess_coach")
MAX_TOKENS = 300

# ─── Prompt Templates ───────────────────────────────────────

SYSTEM_PROMPT = """You are a Socratic chess coach. You guide understanding through questions, not lectures.

RESPONSE FORMAT:
- Maximum 2-4 sentences total. Be punchy and direct.
- ALWAYS lead with a question before any explanation.
- If the student played the best or a strong move: briefly affirm, then ask them to explain their reasoning.
- If the student played a suboptimal move: ask a guiding question about what the better move achieves.
- Never give the answer directly — guide the student to discover it.

RULES:
- ONLY reference facts from the BOARD ANALYSIS section. Never invent board state.
- Ground advice in chess principles: center control, development, king safety, pawn structure, tactics.
- When answering follow-up questions, stay concise (2-4 sentences) and Socratic."""

POSITION_ANALYSIS_TEMPLATE = f"""
=== BOARD ANALYSIS (Ground Truth — do not contradict) ===
FEN: {{fen}}
Side to move: {{turn}}
Student plays: {{player_color}}

ENGINE TOP MOVES:
{{top_moves}}

POSITIONAL FEATURES:
{{heuristics}}

=== TASK ===
Analyze this position. Explain the key strategic themes and why the engine's top move is strong.
"""

MOVE_COMPARISON_TEMPLATE = f"""
=== BOARD ANALYSIS (Ground Truth — do not contradict) ===
FEN: {{fen}}
Side to move: {{turn}}
Student plays: {{player_color}}

ENGINE'S BEST MOVE: {{best_move}} (eval: {{best_score}} cp)
USER'S MOVE: {{user_move}} (eval: {{user_score}} cp)
EVAL DIFFERENCE: {{delta}} centipawns

ENGINE TOP MOVES:
{{top_moves}}

POSITIONAL FEATURES (before move):
{{heuristics_before}}

POSITIONAL FEATURES (after user's move):
{{heuristics_after}}

=== TASK ===
The student played {{user_move}} instead of the engine's {{best_move}}.
Compare both moves using chess principles. Explain what the student's move
gains or loses strategically. Be encouraging but honest.
"""

# ─── Coach Class ─────────────────────────────────────────────


class Coach:
    """Reasoning layer — LLM synthesis from grounded facts."""

    def __init__(self):
        self.client = anthropic.Anthropic()
        self.conversation_history = []
        # self.model = "claude-sonnet-4-5-20250929"
        self.model = "claude-opus-4-6"

    def analyze_position(self, fen, turn, top_moves_str, heuristics_str, player_color: str) -> str:
        prompt = self.build_position_analysis_prompt(
            fen=fen,
            turn=turn,
            top_moves_str=top_moves_str,
            heuristics_str=heuristics_str,
            player_color=player_color,
        )
        return self._send(prompt)

    def compare_moves(self, fen, turn_after, best_move, best_score,
                      user_move, user_score, delta,
                      top_moves_str, heuristics_before, heuristics_after,
                      user_message: str | None = None, player_color: str | None = None) -> str:
        prompt = self.build_move_comparison_prompt(
            fen=fen,
            turn_after=turn_after,
            best_move=best_move,
            best_score=best_score,
            user_move=user_move,
            user_score=user_score,
            delta=delta,
            top_moves_str=top_moves_str,
            heuristics_before=heuristics_before,
            heuristics_after=heuristics_after,
            user_message=user_message,
            player_color=player_color,
        )
        return self._send(prompt)

    def compare_moves_stream(self, fen, turn_after, best_move, best_score,
                             user_move, user_score, delta,
                             top_moves_str, heuristics_before, heuristics_after,
                             user_message: str | None = None, audit_metadata: dict | None = None,
                             player_color: str | None = None):
        """Streaming variant of compare_moves. Yields text chunks."""
        prompt = self.build_move_comparison_prompt(
            fen=fen,
            turn_after=turn_after,
            best_move=best_move,
            best_score=best_score,
            user_move=user_move,
            user_score=user_score,
            delta=delta,
            top_moves_str=top_moves_str,
            heuristics_before=heuristics_before,
            heuristics_after=heuristics_after,
            user_message=user_message,
            player_color=player_color,
        )
        yield from self._send_stream(prompt, audit_metadata=audit_metadata)

    def analyze_position_stream(self, fen, turn, top_moves_str, heuristics_str,
                                user_message: str | None = None, audit_metadata: dict | None = None,
                                player_color: str | None = None):
        """Streaming variant of analyze_position. Yields text chunks."""
        prompt = self.build_position_analysis_prompt(
            fen=fen,
            turn=turn,
            top_moves_str=top_moves_str,
            heuristics_str=heuristics_str,
            user_message=user_message,
            player_color=player_color,
        )
        yield from self._send_stream(prompt, audit_metadata=audit_metadata)

    def followup(self, question: str) -> str:
        """Handle free-form follow-up questions with conversation context."""
        return self._send(question)

    MAX_HISTORY = 20

    def prune_history(self):
        if len(self.conversation_history) > self.MAX_HISTORY:
            initial = self.conversation_history[0:2]
            recent = self.conversation_history[-(self.MAX_HISTORY - 2):]
            self.conversation_history = initial + recent

    def _build_request_payload(self) -> dict:
        return {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": [dict(message) for message in self.conversation_history],
        }

    def _append_user_question(self, prompt: str, user_message: str | None) -> str:
        if not user_message or not user_message.strip():
            return prompt
        return f"{prompt}\n\n=== STUDENT'S QUESTION ===\n{user_message.strip()}"

    def build_position_analysis_prompt(self, *, fen: str, turn: str,
                                       top_moves_str: str, heuristics_str: str,
                                       user_message: str | None = None,
                                       player_color: str) -> str:
        prompt = POSITION_ANALYSIS_TEMPLATE.format(
            fen=fen,
            turn=turn,
            player_color=player_color,
            top_moves=top_moves_str,
            heuristics=heuristics_str,
        )
        return self._append_user_question(prompt, user_message)

    def build_move_comparison_prompt(self, *, fen: str, turn_after: str,
                                     best_move: str, best_score,
                                     user_move: str, user_score, delta,
                                     top_moves_str: str,
                                     heuristics_before: str,
                                     heuristics_after: str,
                                     user_message: str | None = None,
                                     player_color: str) -> str:
        prompt = MOVE_COMPARISON_TEMPLATE.format(
            fen=fen,
            turn=turn_after,
            player_color=player_color,
            best_move=best_move,
            best_score=best_score,
            user_move=user_move,
            user_score=user_score,
            delta=delta,
            top_moves=top_moves_str,
            heuristics_before=heuristics_before,
            heuristics_after=heuristics_after,
        )
        return self._append_user_question(prompt, user_message)

    def _send(self, user_message: str, audit_metadata: dict | None = None) -> str:
        self.conversation_history.append({"role": "user", "content": user_message})
        self.prune_history()
        logger.debug("PROMPT SENT TO CLAUDE:\n%s", user_message)
        request_payload = self._build_request_payload()

        if audit_metadata:
            append_chat_audit_entry(
                request_id=audit_metadata["request_id"],
                session_id=audit_metadata["session_id"],
                raw_user_message=audit_metadata["raw_user_message"],
                enriched_prompt=audit_metadata["enriched_prompt"],
            )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.client.messages.create(
                    **request_payload,
                )
                break
            except anthropic.RateLimitError:
                wait = 2 ** attempt
                logger.warning("Rate limited by API. Retrying in %ds...", wait)
                print(f"Rate limited. Retrying in {wait}s...")
                time.sleep(wait)
            except anthropic.APIConnectionError as e:
                logger.error("API connection failed: %s", e)
                self.conversation_history.pop()
                return "Connection error — check your internet and try again."
            except anthropic.APIStatusError as e:
                logger.error("API error (status %d): %s", e.status_code, e.message)
                self.conversation_history.pop()
                return f"API error ({e.status_code}). Please try again."
        else:
            self.conversation_history.pop()
            return "Rate limit exceeded after retries. Please wait a moment and try again."

        assistant_text = response.content[0].text
        self.conversation_history.append({"role": "assistant", "content": assistant_text})

        logger.debug("CLAUDE RESPONSE:\n%s", assistant_text)
        logger.info(
            "Tokens used — input: %d, output: %d",
            response.usage.input_tokens,
            response.usage.output_tokens,
        )

        return assistant_text

    def _send_stream(self, user_message: str, audit_metadata: dict | None = None):
        """Streaming variant of _send. Yields text chunks as they arrive."""
        self.conversation_history.append({"role": "user", "content": user_message})
        self.prune_history()
        logger.debug("PROMPT SENT TO CLAUDE (stream):\n%s", user_message)
        request_payload = self._build_request_payload()

        if audit_metadata:
            append_chat_audit_entry(
                request_id=audit_metadata["request_id"],
                session_id=audit_metadata["session_id"],
                raw_user_message=audit_metadata["raw_user_message"],
                enriched_prompt=audit_metadata["enriched_prompt"],
            )

        try:
            full_text = []
            with self.client.messages.stream(
                **request_payload,
            ) as stream:
                for text in stream.text_stream:
                    full_text.append(text)
                    yield text

            assistant_text = "".join(full_text)
            self.conversation_history.append({"role": "assistant", "content": assistant_text})
            logger.debug("CLAUDE RESPONSE (stream):\n%s", assistant_text)

        except (anthropic.APIConnectionError, anthropic.APIStatusError, anthropic.RateLimitError) as e:
            logger.error("Streaming API error: %s", e)
            self.conversation_history.pop()
            yield "Coach unavailable. Try again."
