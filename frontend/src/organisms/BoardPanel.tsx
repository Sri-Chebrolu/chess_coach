import { useEffect, useRef, useState, useCallback } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { EvalBar } from '../atoms/EvalBar'
import { MoveCard } from '../molecules/MoveCard'
import { PgnNavigator } from './PgnNavigator'
import { apiFetch } from '../api'
import type { EngineMove, ChatMessage, PgnNav } from '../types'

interface MoveResponse {
  valid: boolean
  fen_after: string
  turn_after: 'White' | 'Black'
  user_move: { san: string; score_cp: number; mate: number | null }
  best_move: { san: string; score_cp: number; mate: number | null }
  delta_cp: number
  top_moves: EngineMove[]
  coach_response: string
}

interface OpponentMoveResponse {
  opponent_move: { san: string; uci: string; from: string; to: string }
  fen_after: string
  turn_after: 'White' | 'Black'
  top_moves: EngineMove[]
}

interface BoardPanelProps {
  sessionId: string
  currentFen: string
  turn: 'White' | 'Black'
  topMoves: EngineMove[]
  pgn: PgnNav | null
  opponentElo: number | null
  onFenChange: (fen: string, turn: 'White' | 'Black') => void
  onTopMovesChange: (moves: EngineMove[]) => void
  onCoachMessage: (message: ChatMessage) => void
  onSetThinking: (thinking: boolean) => void
  onPgnNavigate: (pgn: PgnNav, fen: string, turn: 'White' | 'Black') => void
}

function getPvArrows(topMoves: EngineMove[], fen: string): [Square, Square, string][] {
  if (!topMoves.length || !topMoves[0].pv.length) return []
  try {
    const game = new Chess(fen)
    const result = game.move(topMoves[0].pv[0])
    if (!result) return []
    return [[result.from, result.to, 'rgba(118, 150, 86, 0.6)']]
  } catch {
    return []
  }
}

export function BoardPanel({
  sessionId,
  currentFen,
  turn,
  topMoves,
  pgn,
  opponentElo,
  onFenChange,
  onTopMovesChange,
  onCoachMessage,
  onSetThinking,
  onPgnNavigate,
}: BoardPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [boardWidth, setBoardWidth] = useState(480)
  const prevFenRef = useRef(currentFen)
  const [flashSquare, setFlashSquare] = useState<string | null>(null)
  const [waitingForOpponent, setWaitingForOpponent] = useState(false)

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width
      setBoardWidth(Math.min(Math.max(width - 24, 320), 640))
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const fetchOpponentMove = useCallback(
    async (fen: string) => {
      if (!opponentElo) return
      setWaitingForOpponent(true)

      // Brief delay for realism
      await new Promise((r) => setTimeout(r, 1500))

      try {
        const res = await apiFetch<OpponentMoveResponse>('/api/opponent-move', {
          session_id: sessionId,
          fen,
          elo: opponentElo,
        })
        if (res.data) {
          onFenChange(res.data.fen_after, res.data.turn_after)
          onTopMovesChange(res.data.top_moves)
          onCoachMessage({
            role: 'system',
            content: `Opponent played ${res.data.opponent_move.san}`,
            timestamp: new Date().toISOString(),
          })
        }
      } catch {
        onCoachMessage({
          role: 'system',
          content: 'Opponent move failed. Try making another move.',
          timestamp: new Date().toISOString(),
        })
      } finally {
        setWaitingForOpponent(false)
      }
    },
    [sessionId, opponentElo, onFenChange, onTopMovesChange, onCoachMessage],
  )

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (waitingForOpponent) return false

      const game = new Chess(currentFen)
      let result
      try {
        result = game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
      } catch {
        return false
      }
      if (!result) return false

      const fenBefore = currentFen
      prevFenRef.current = fenBefore
      onFenChange(game.fen(), game.turn() === 'w' ? 'White' : 'Black')
      onSetThinking(true)

      apiFetch<MoveResponse>('/api/move', {
        session_id: sessionId,
        fen: fenBefore,
        move: result.san,
      })
        .then((res) => {
          if (res.data) {
            onTopMovesChange(res.data.top_moves)
            onCoachMessage({
              role: 'coach',
              content: res.data.coach_response,
              timestamp: new Date().toISOString(),
            })
            // If opponent mode is active, fetch computer's response
            if (opponentElo) {
              fetchOpponentMove(res.data.fen_after)
            }
          }
        })
        .catch((err) => {
          if (err.code === 'INVALID_MOVE') {
            onFenChange(fenBefore, turn)
            setFlashSquare(sourceSquare)
            setTimeout(() => setFlashSquare(null), 350)
          } else {
            onFenChange(fenBefore, turn)
            onCoachMessage({
              role: 'system',
              content: `Analysis failed: ${err.message}. Try again.`,
              timestamp: new Date().toISOString(),
            })
          }
        })
        .finally(() => onSetThinking(false))

      return true
    },
    [currentFen, sessionId, turn, opponentElo, waitingForOpponent, onFenChange, onTopMovesChange, onCoachMessage, onSetThinking, fetchOpponentMove],
  )

  const pvArrows = getPvArrows(topMoves, currentFen)

  const customSquareStyles: Record<string, React.CSSProperties> = flashSquare
    ? { [flashSquare]: { backgroundColor: 'rgba(204, 68, 68, 0.4)' } }
    : {}

  const evalScore = topMoves[0]?.score_cp ?? 0
  const evalMate = topMoves[0]?.mate ?? null

  return (
    <div className="flex flex-col h-full bg-bg-primary overflow-hidden">
      <div ref={containerRef} className="flex flex-row gap-2 p-3 flex-1 min-h-0">
        <EvalBar scoreCp={evalScore} mate={evalMate} height={boardWidth} data-testid="eval-bar" />

        <div data-testid="chess-board" style={{ width: boardWidth }}>
          <Chessboard
            position={currentFen}
            onPieceDrop={handlePieceDrop}
            boardWidth={boardWidth}
            boardOrientation={turn === 'Black' ? 'black' : 'white'}
            customBoardStyle={{
              border: '1px solid var(--border)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            }}
            customDarkSquareStyle={{ backgroundColor: '#769656' }}
            customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
            customArrows={pvArrows}
            customSquareStyles={customSquareStyles}
            animationDuration={200}
          />
        </div>
      </div>

      {/* Opponent thinking indicator */}
      {waitingForOpponent && (
        <div className="px-3 py-1 text-[11px] font-mono text-text-muted blinking-cursor">
          Opponent is thinking...
        </div>
      )}

      {/* PGN Navigator (conditional) */}
      {pgn && (
        <div className="px-3 pb-2">
          <PgnNavigator sessionId={sessionId} pgn={pgn} onNavigate={onPgnNavigate} />
        </div>
      )}

      {/* Engine lines */}
      <div className="border-t border-border-default">
        {topMoves.map((move, i) => (
          <MoveCard
            key={move.san}
            rank={i + 1}
            san={move.san}
            scoreCp={move.score_cp}
            mate={move.mate}
            pv={move.pv}
            data-testid={`engine-line-${i}`}
          />
        ))}
        {topMoves.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-text-muted font-mono">No engine lines yet.</div>
        )}
      </div>
    </div>
  )
}
