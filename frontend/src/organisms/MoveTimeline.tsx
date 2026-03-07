import { MonoText } from '../atoms/MonoText'
import type { MoveTimeline as MoveTimelineType } from '../types'

interface MoveTimelineProps {
  timeline: MoveTimelineType
  currentIndex: number
  onSelectEntry: (index: number) => void
}

export function MoveTimeline({ timeline, currentIndex, onSelectEntry }: MoveTimelineProps) {
  const { entries } = timeline

  if (entries.length <= 1) {
    return (
      <div className="px-3 py-4 text-[12px] text-text-muted font-mono">
        No moves yet.
      </div>
    )
  }

  // Group entries into full-move pairs (White + Black)
  const rows: { moveNum: string | null; white: typeof entries[0] | null; black: typeof entries[0] | null }[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.san === null) continue // skip initial position

    if (entry.turn === 'Black') {
      // This entry was White's move (turn is Black after White moves)
      rows.push({ moveNum: entry.moveNumberLabel, white: entry, black: null })
    } else {
      // This entry was Black's move — attach to last row
      if (rows.length > 0 && rows[rows.length - 1].black === null) {
        rows[rows.length - 1].black = entry
      } else {
        rows.push({ moveNum: entry.moveNumberLabel, white: null, black: entry })
      }
    }
  }

  return (
    <div className="flex flex-col">
      {/* Start position row */}
      <button
        onClick={() => onSelectEntry(0)}
        className={[
          'flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
          currentIndex === 0
            ? 'bg-accent/10 border-l-2 border-l-accent'
            : 'hover:bg-bg-surface border-l-2 border-l-transparent',
        ].join(' ')}
      >
        <MonoText size="sm" color="muted">Start</MonoText>
      </button>

      {rows.map((row, i) => (
        <div key={i} className="flex items-center">
          <span className="w-8 text-right pr-1 text-[11px] font-mono text-text-muted shrink-0">
            {row.moveNum?.replace('.', '') ?? ''}
          </span>
          {row.white && (
            <button
              onClick={() => onSelectEntry(row.white!.index)}
              className={[
                'flex-1 px-2 py-1 text-left text-[12px] font-mono transition-colors',
                currentIndex === row.white.index
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-text-primary hover:bg-bg-surface',
              ].join(' ')}
            >
              {row.white.san}
            </button>
          )}
          {!row.white && <span className="flex-1 px-2 py-1 text-[12px] font-mono text-text-muted">...</span>}
          {row.black && (
            <button
              onClick={() => onSelectEntry(row.black!.index)}
              className={[
                'flex-1 px-2 py-1 text-left text-[12px] font-mono transition-colors',
                currentIndex === row.black.index
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-text-primary hover:bg-bg-surface',
              ].join(' ')}
            >
              {row.black.san}
            </button>
          )}
          {!row.black && <span className="flex-1" />}
        </div>
      ))}
    </div>
  )
}
