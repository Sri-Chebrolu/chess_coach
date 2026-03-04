import { useEffect, useRef, useState } from 'react'
import { MonoText } from '../atoms/MonoText'
import type { PgnNav } from '../types'
import { apiFetch, ApiError } from '../api'

interface PgnNavigatorProps {
  sessionId: string
  pgn: PgnNav
  onNavigate: (pgn: PgnNav, fen: string, turn: 'White' | 'Black') => void
  onError?: (message: string) => void
}

type NavigateAction = 'prev' | 'next' | 'start' | 'end'

interface NavigateResponse {
  fen: string
  turn: 'White' | 'Black'
  move_index: number
  total_moves: number
  move_display: string
  last_move_san: string | null
}

export function PgnNavigator({ sessionId, pgn, onNavigate, onError }: PgnNavigatorProps) {
  const [isNavigating, setIsNavigating] = useState(false)
  const requestSeqRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      requestSeqRef.current += 1
    }
  }, [])

  async function navigate(action: NavigateAction) {
    const seq = ++requestSeqRef.current
    setIsNavigating(true)
    try {
      const res = await apiFetch<NavigateResponse>('/api/pgn/navigate', {
        session_id: sessionId,
        action,
      })
      if (res.data && mountedRef.current && seq === requestSeqRef.current) {
        onNavigate(
          {
            move_index: res.data.move_index,
            total_moves: res.data.total_moves,
            move_display: res.data.move_display,
          },
          res.data.fen,
          res.data.turn,
        )
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'PGN navigation failed.'
      onError?.(message)
    } finally {
      if (mountedRef.current && seq === requestSeqRef.current) {
        setIsNavigating(false)
      }
    }
  }

  const atStart = isNavigating || pgn.move_index === 0
  const atEnd = isNavigating || pgn.move_index >= pgn.total_moves

  // Highlight the * marker in move display
  const displayParts = pgn.move_display.split('*')

  return (
    <div data-testid="pgn-navigator" className="border border-border-default bg-bg-surface p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            data-testid="pgn-start"
            title="Jump to first move"
            onClick={() => navigate('start')}
            disabled={atStart}
            className="px-2 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Start
          </button>
          <button
            data-testid="pgn-prev"
            title="Step one move backward"
            onClick={() => navigate('prev')}
            disabled={atStart}
            className="px-2 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Prev
          </button>
        </div>

        <MonoText size="sm" color="secondary">
          Move {pgn.move_index} / {pgn.total_moves}
        </MonoText>

        <div className="flex gap-1">
          <button
            data-testid="pgn-next"
            title="Step one move forward"
            onClick={() => navigate('next')}
            disabled={atEnd}
            className="px-2 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
          <button
            data-testid="pgn-end"
            title="Jump to final move"
            onClick={() => navigate('end')}
            disabled={atEnd}
            className="px-2 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            End
          </button>
        </div>
      </div>

      <div data-testid="pgn-moves" className="font-mono text-[11px] text-text-secondary leading-relaxed">
        {displayParts.map((part, i) => (
          <span key={i}>
            {part}
            {i < displayParts.length - 1 && (
              <span className="text-accent font-medium">▶</span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
