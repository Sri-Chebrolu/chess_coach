import { MonoText } from '../atoms/MonoText'
import { StatusPill } from '../atoms/StatusPill'

interface MoveCardProps {
  rank: number
  san: string
  scoreCp: number
  mate: number | null
  pv: string[]
  isUserMove?: boolean
  'data-testid'?: string
}

function formatEval(scoreCp: number, mate: number | null): { label: string; variant: 'positive' | 'negative' | 'neutral' } {
  if (mate !== null) {
    return {
      label: mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`,
      variant: mate > 0 ? 'positive' : 'negative',
    }
  }
  const pawns = (scoreCp / 100).toFixed(2)
  const label = scoreCp >= 0 ? `+${pawns}` : pawns
  return {
    label,
    variant: scoreCp > 0 ? 'positive' : scoreCp < 0 ? 'negative' : 'neutral',
  }
}

export function MoveCard({ rank, san, scoreCp, mate, pv, isUserMove = false, 'data-testid': testId }: MoveCardProps) {
  const evalInfo = formatEval(scoreCp, mate)
  const pvDisplay = pv.slice(1).join(' ')

  return (
    <div
      data-testid={testId ?? `move-card-${san.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
      className={[
        'flex items-center gap-3 px-3 py-2 border-b border-border-default',
        isUserMove ? 'bg-bg-elevated' : 'bg-bg-surface',
      ].join(' ')}
    >
      <MonoText size="sm" color="muted" className="w-4 shrink-0">
        {rank}
      </MonoText>
      <MonoText size="md" color={rank === 1 ? 'accent' : 'primary'} className="font-medium w-10 shrink-0">
        {san}
      </MonoText>
      <StatusPill label={evalInfo.label} variant={evalInfo.variant} />
      {pvDisplay && (
        <MonoText size="sm" color="muted" className="truncate">
          {pvDisplay}
        </MonoText>
      )}
    </div>
  )
}
