import time
import logging
import re
import anthropic
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("chess_coach")

# ─── Prompt Templates ───────────────────────────────────────

SYSTEM_PROMPT = """You are an expert chess coach. You teach through a concise Socratic style:
ask one sharp question that helps the student think.

RULES:
- ONLY reference facts provided in the BOARD ANALYSIS section. Never invent board state.
- Ground all advice in chess principles: center control, piece development, king safety,
  pawn structure, piece activity, tactical motifs.
- When comparing moves, explain the trade-offs in terms of these principles.
- Keep every answer punchy: 2-4 short sentences total.
- Avoid long move trees, long lists, and repetition.
- End with one coaching question."""

POSITION_ANALYSIS_TEMPLATE = """
=== BOARD ANALYSIS (Ground Truth — do not contradict) ===
FEN: {fen}
Side to move: {turn}

ENGINE TOP MOVES:
{top_moves}

POSITIONAL FEATURES:
{heuristics}

=== TASK ===
Analyze this position. Explain the key strategic themes and why the engine's top move is strong.
Respond in 2-4 short sentences.
"""

MOVE_COMPARISON_TEMPLATE = """
=== BOARD ANALYSIS (Ground Truth — do not contradict) ===
FEN: {fen}
Side to move: {turn}

ENGINE'S BEST MOVE: {best_move} (eval: {best_score} cp)
USER'S MOVE: {user_move} (eval: {user_score} cp)
EVAL DIFFERENCE: {delta} centipawns

ENGINE TOP MOVES:
{top_moves}

POSITIONAL FEATURES (before move):
{heuristics_before}

POSITIONAL FEATURES (after user's move):
{heuristics_after}

=== TASK ===
The student played {user_move} instead of the engine's {best_move}.
Compare both moves using chess principles. Explain what the student's move
gains or loses strategically. Be encouraging but honest.
Respond in 2-4 short sentences.
"""

# ─── Coach Class ─────────────────────────────────────────────


class Coach:
    """Reasoning layer — LLM synthesis from grounded facts."""

    def __init__(self):
        self.client = anthropic.Anthropic(max_retries=0)
        self.conversation_history = []
        self.model = "claude-sonnet-4-5-20250929"

    def analyze_position(self, fen, turn, top_moves_str, heuristics_str) -> str:
        prompt = POSITION_ANALYSIS_TEMPLATE.format(
            fen=fen, turn=turn,
            top_moves=top_moves_str,
            heuristics=heuristics_str,
        )
        return self._send(prompt)

    def compare_moves(self, fen, turn, best_move, best_score,
                      user_move, user_score, delta,
                      top_moves_str, heuristics_before, heuristics_after) -> str:
        prompt = MOVE_COMPARISON_TEMPLATE.format(
            fen=fen, turn=turn,
            best_move=best_move, best_score=best_score,
            user_move=user_move, user_score=user_score, delta=delta,
            top_moves=top_moves_str,
            heuristics_before=heuristics_before,
            heuristics_after=heuristics_after,
        )
        return self._send(prompt)

    def followup(self, question: str) -> str:
        """Handle free-form follow-up questions with conversation context."""
        return self._send(question)

    MAX_HISTORY = 20
    MAX_SENTENCES = 4
    REQUEST_TIMEOUT_SECONDS = 3.5
    _SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")

    def prune_history(self):
        if len(self.conversation_history) > self.MAX_HISTORY:
            initial = self.conversation_history[0:2]
            recent = self.conversation_history[-(self.MAX_HISTORY - 2):]
            self.conversation_history = initial + recent

    def _format_response(self, text: str) -> str:
        compact = " ".join(text.strip().split())
        if not compact:
            return "Nice effort. Which candidate move best improves your king safety here?"

        sentences = [s.strip() for s in self._SENTENCE_SPLIT_RE.split(compact) if s.strip()]
        if len(sentences) <= self.MAX_SENTENCES:
            return compact
        return " ".join(sentences[:self.MAX_SENTENCES]).strip()

    def _low_latency_fallback(self) -> str:
        return (
            "Good effort—focus first on center control and king safety. "
            "Then compare your candidate move against the engine's top line. "
            "What concrete threat are you trying to create on your next move?"
        )

    def _send(self, user_message: str) -> str:
        self.conversation_history.append({"role": "user", "content": user_message})
        self.prune_history()
        logger.debug("PROMPT SENT TO CLAUDE:\n%s", user_message)

        max_retries = 2
        for attempt in range(max_retries):
            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=220,
                    system=SYSTEM_PROMPT,
                    messages=self.conversation_history,
                    timeout=self.REQUEST_TIMEOUT_SECONDS,
                )
                break
            except anthropic.RateLimitError:
                wait = 0.25 * (attempt + 1)
                logger.warning("Rate limited by API. Retrying in %.2fs...", wait)
                time.sleep(wait)
            except anthropic.APITimeoutError:
                logger.warning("Coach request timed out after %.1fs", self.REQUEST_TIMEOUT_SECONDS)
                self.conversation_history.pop()
                return self._low_latency_fallback()
            except anthropic.APIConnectionError as e:
                logger.error("API connection failed: %s", e)
                self.conversation_history.pop()
                return self._low_latency_fallback()
            except anthropic.APIStatusError as e:
                logger.error("API error (status %d): %s", e.status_code, e.message)
                self.conversation_history.pop()
                return f"API error ({e.status_code}). Please try again."
        else:
            self.conversation_history.pop()
            return "Rate limit exceeded after retries. Please wait a moment and try again."

        assistant_text = self._format_response(response.content[0].text)
        self.conversation_history.append({"role": "assistant", "content": assistant_text})

        logger.debug("CLAUDE RESPONSE:\n%s", assistant_text)
        logger.info(
            "Tokens used — input: %d, output: %d",
            response.usage.input_tokens,
            response.usage.output_tokens,
        )

        return assistant_text
