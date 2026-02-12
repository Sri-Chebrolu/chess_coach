import time
import logging
import anthropic
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("chess_coach")

# ─── Prompt Templates ───────────────────────────────────────

SYSTEM_PROMPT = """You are an expert chess coach. You teach through the Socratic method —
asking questions to guide understanding rather than just giving answers.

RULES:
- ONLY reference facts provided in the BOARD ANALYSIS section. Never invent board state.
- Ground all advice in chess principles: center control, piece development, king safety,
  pawn structure, piece activity, tactical motifs.
- When comparing moves, explain the trade-offs in terms of these principles.
- Keep responses concise (1-2 paragraphs max).
- End with a thought-provoking question when appropriate."""

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
"""

# ─── Coach Class ─────────────────────────────────────────────


class Coach:
    """Reasoning layer — LLM synthesis from grounded facts."""

    def __init__(self):
        self.client = anthropic.Anthropic()
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

    def _send(self, user_message: str) -> str:
        self.conversation_history.append({"role": "user", "content": user_message})
        logger.debug("PROMPT SENT TO CLAUDE:\n%s", user_message)

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=1024,
                    system=SYSTEM_PROMPT,
                    messages=self.conversation_history,
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
