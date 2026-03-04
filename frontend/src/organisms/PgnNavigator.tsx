import { MonoText } from '../atoms/MonoText'
import { SquareButton } from '../atoms/SquareButton'
import type { PgnNav } from '../types'
import { apiFetch } from '../api'

interface PgnNavigatorProps {
  sessionId: string
  pgn: PgnNav
  onNavigate: (pgn: PgnNav, fen: string, turn: 'White' | 'Black') => void
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

export function PgnNavigator({ sessionId, pgn, onNavigate }: PgnNavigatorProps) {
  async function navigate(action: NavigateAction) {
    try {
      const res = await apiFetch<NavigateResponse>('/api/pgn/navigate', {
        session_id: sessionId,
        action,
      })
      if (res.data) {
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
    } catch {
      // Navigation errors (bounds) are silent — buttons dim at bounds
    }
  }

  const atStart = pgn.move_index === 0
  const atEnd = pgn.move_index >= pgn.total_moves

  // Highlight the * marker in move display
  const displayParts = pgn.move_display.split('*')

  return (
    <div data-testid="pgn-navigator" className="border border-border-default bg-bg-surface p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            data-testid="pgn-start"
            onClick={() => navigate('start')}
            disabled={atStart}
            className="px-2 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ⏮
          </button>
          <button
            data-testid="pgn-prev"
            onClick={() => navigate('prev')}
            disabled={atStart}
            className="px-2 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ◀
          </button>
        </div>

        <MonoText size="sm" color="secondary">
          Move {pgn.move_index} / {pgn.total_moves}
        </MonoText>

        <div className="flex gap-1">
          <button
            data-testid="pgn-next"
            onClick={() => navigate('next')}
            disabled={atEnd}
            className="px-2 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ▶
          </button>
          <button
            data-testid="pgn-end"
            onClick={() => navigate('end')}
            disabled={atEnd}
            className="px-2 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ⏭
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
