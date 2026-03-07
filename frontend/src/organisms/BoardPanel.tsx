import { useEffect, useRef, useState, useCallback } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import type { EngineMove, MoveExecutionResult } from '../types'

interface BoardPanelProps {
  currentFen: string
  turn: 'White' | 'Black'
  playerColor: 'white' | 'black'
  topMoves: EngineMove[]
  showBestLine: boolean
  showBestMoveSource: boolean
  isSubmittingMove: boolean
  isWaitingForOpponent: boolean
  lastMoveResult: MoveExecutionResult | null
  onMoveAttempt: (san: string, fenBefore: string) => void
}

export function BoardPanel({
  currentFen,
  turn,
  playerColor,
  topMoves,
  showBestLine,
  showBestMoveSource,
  isSubmittingMove,
  isWaitingForOpponent,
  lastMoveResult,
  onMoveAttempt,
}: BoardPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [boardWidth, setBoardWidth] = useState(900)

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width
      setBoardWidth(Math.min(Math.max(width - 24, 320), 750))
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (isSubmittingMove || isWaitingForOpponent) return false

      const game = new Chess(currentFen)
      let result
      try {
        result = game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
      } catch {
        return false
      }
      if (!result) return false

      onMoveAttempt(result.san, currentFen)
      return true
    },
    [currentFen, isSubmittingMove, isWaitingForOpponent, onMoveAttempt],
  )

  // PV arrows: only show when showBestLine is toggled on
  const pvArrows: [Square, Square, string][] = []
  if (showBestLine && topMoves.length > 0 && topMoves[0].fromSquare && topMoves[0].toSquare) {
    pvArrows.push([topMoves[0].fromSquare as Square, topMoves[0].toSquare as Square, 'rgba(118, 150, 86, 0.6)'])
  }

  // Source square highlight: show when showBestMoveSource is toggled on
  const customSquareStyles: Record<string, React.CSSProperties> = {}
  if (showBestMoveSource && topMoves.length > 0 && topMoves[0].fromSquare) {
    customSquareStyles[topMoves[0].fromSquare] = { backgroundColor: 'rgba(255, 170, 0, 0.5)' }
  }

  // Last move highlight
  if (lastMoveResult) {
    customSquareStyles[lastMoveResult.fromSquare] = {
      ...customSquareStyles[lastMoveResult.fromSquare],
      boxShadow: 'inset 0 0 0 3px rgba(255, 255, 0, 0.4)',
    }
    customSquareStyles[lastMoveResult.toSquare] = {
      ...customSquareStyles[lastMoveResult.toSquare],
      boxShadow: 'inset 0 0 0 3px rgba(255, 255, 0, 0.4)',
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary overflow-hidden">
      <div ref={containerRef} className="flex flex-row gap-2 p-3 flex-1 min-h-0">
        <div data-testid="chess-board" style={{ width: boardWidth }}>
          <Chessboard
            position={currentFen}
            onPieceDrop={handlePieceDrop}
            boardWidth={boardWidth}
            boardOrientation={playerColor}
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

      {isWaitingForOpponent && (
        <div className="px-3 py-1 text-[11px] font-mono text-text-muted blinking-cursor">
          Opponent is thinking...
        </div>
      )}
    </div>
  )
}
