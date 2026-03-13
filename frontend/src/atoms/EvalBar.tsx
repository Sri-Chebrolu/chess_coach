interface EvalBarProps {
  scoreCp: number
  mate: number | null
  height: number
  'data-testid'?: string
}

export function EvalBar({ scoreCp, mate, height, 'data-testid': testId }: EvalBarProps) {
  let whitePct: number

  if (mate !== null) {
    whitePct = mate > 0 ? 100 : 0
  } else {
    const clamped = Math.min(Math.max(scoreCp, -1000), 1000)
    whitePct = 50 + (clamped / 1000) * 50
  }

  const blackPct = 100 - whitePct

  return (
    <div
      data-testid={testId}
      style={{ width: 16, height, flexShrink: 0 }}
      className="flex flex-col border border-border-default overflow-hidden rounded-lg"
    >
      {/* Black portion (top) */}
      <div
        style={{
          height: `${blackPct}%`,
          backgroundColor: 'var(--eval-black)',
          transition: 'height 300ms ease',
        }}
      />
      {/* White portion (bottom) */}
      <div
        style={{
          height: `${whitePct}%`,
          backgroundColor: 'var(--eval-white)',
          transition: 'height 300ms ease',
        }}
      />
    </div>
  )
}
