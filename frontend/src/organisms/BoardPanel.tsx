import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
  onMoveAttempt: (san: string, fenBefore: string, fenAfter: string) => void
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
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width
      setBoardWidth(Math.min(Math.max(width - 24, 320), 750))
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Clear selection when position changes
  useEffect(() => { setSelectedSquare(null) }, [currentFen])

  // Shared move validation for both drag-and-drop and click-to-move
  const tryMove = useCallback(
    (sourceSquare: string, targetSquare: string): string | null => {
      if (isSubmittingMove || isWaitingForOpponent) return null

      const game = new Chess(currentFen)
      let result
      try {
        result = game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
      } catch {
        return null
      }
      if (!result) return null

      onMoveAttempt(result.san, currentFen, game.fen())
      return result.san
    },
    [currentFen, isSubmittingMove, isWaitingForOpponent, onMoveAttempt],
  )

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      return tryMove(sourceSquare, targetSquare) !== null
    },
    [tryMove],
  )

  // Legal destinations for selected piece (visual feedback only)
  const legalMoves = useMemo(() => {
    if (!selectedSquare) return []
    const game = new Chess(currentFen)
    return game.moves({ square: selectedSquare as Square, verbose: true })
  }, [selectedSquare, currentFen])

  const handleSquareClick = useCallback((square: string) => {
    if (isSubmittingMove || isWaitingForOpponent) return

    const game = new Chess(currentFen)
    const piece = game.get(square as Square)

    if (selectedSquare) {
      // Try to move to clicked square — same validation as drag-and-drop
      if (tryMove(selectedSquare, square)) {
        setSelectedSquare(null)
        return
      }

      // Clicked another friendly piece → switch selection
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square)
        return
      }

      // Invalid target → deselect
      setSelectedSquare(null)
      return
    }

    // Nothing selected → select if friendly piece
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square)
    }
  }, [selectedSquare, currentFen, isSubmittingMove, isWaitingForOpponent, tryMove])

  // PV arrows: only show when showBestLine is toggled on
  const pvArrows: [Square, Square, string][] = []
  if (showBestLine && topMoves.length > 0 && topMoves[0].fromSquare && topMoves[0].toSquare) {
    pvArrows.push([topMoves[0].fromSquare as Square, topMoves[0].toSquare as Square, 'rgba(103, 128, 84, 0.55)'])
  }

  // Source square highlight: show when showBestMoveSource is toggled on
  const customSquareStyles: Record<string, React.CSSProperties> = {}
  if (showBestMoveSource && topMoves.length > 0 && topMoves[0].fromSquare) {
    customSquareStyles[topMoves[0].fromSquare] = { backgroundColor: 'rgba(183, 149, 103, 0.38)' }
  }

  // Last move highlight
  if (lastMoveResult) {
    customSquareStyles[lastMoveResult.fromSquare] = {
      ...customSquareStyles[lastMoveResult.fromSquare],
      boxShadow: 'inset 0 0 0 8px rgba(72, 67, 57, 0.28)',
    }
    customSquareStyles[lastMoveResult.toSquare] = {
      ...customSquareStyles[lastMoveResult.toSquare],
      boxShadow: 'inset 0 0 0 8px rgba(72, 67, 57, 0.28)',
    }
  }

  // Selected piece + legal move highlights
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = {
      ...customSquareStyles[selectedSquare],
      boxShadow: 'inset 0 0 0 8px rgba(50, 47, 40, 0.72)',
    }
    for (const move of legalMoves) {
      customSquareStyles[move.to] = {
        ...customSquareStyles[move.to],
        background: 'radial-gradient(circle, rgba(86, 82, 72, 0.22) 23%, transparent 23%)',
      }
    }
  }

  return (
    <div className="overflow-hidden self-start">
      <div ref={containerRef} className="flex flex-row gap-2 p-0">
        <div
          data-testid="chess-board"
          style={{
            width: boardWidth,
            background: 'var(--board-frame)',
            border: '1px solid var(--border)',
            borderRadius: '24px',
            padding: '14px',
            boxShadow: '0 50px 300px rgba(25, 25, 22, 0.18)',
          }}
        >
          <Chessboard
            position={currentFen}
            onPieceDrop={handlePieceDrop}
            onSquareClick={handleSquareClick}
            onSquareRightClick={() => setSelectedSquare(null)}
            boardWidth={boardWidth}
            boardOrientation={playerColor}
            customBoardStyle={{
              borderRadius: '14px',
              border: '1px solid rgba(187, 181, 169, 0.65)',
              boxShadow: '0 10px 300px rgba(28, 27, 24, 0.14)',
            }}
            customDarkSquareStyle={{ backgroundColor: 'var(--board-dark)' }}
            customLightSquareStyle={{ backgroundColor: 'var(--board-light)' }}
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
