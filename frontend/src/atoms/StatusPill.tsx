const variantMap = {
  neutral: 'text-text-secondary border-border-default',
  positive: 'text-accent border-accent',
  negative: 'text-error border-error',
  warning: 'text-warning border-warning',
}

interface StatusPillProps {
  label: string
  variant?: 'neutral' | 'positive' | 'negative' | 'warning'
  'data-testid'?: string
}

export function StatusPill({ label, variant = 'neutral', 'data-testid': testId }: StatusPillProps) {
  return (
    <span
      data-testid={testId}
      style={{ borderRadius: 0 }}
      className={`inline-flex items-center px-2 py-[2px] text-[11px] uppercase tracking-[0.05em] border font-mono ${variantMap[variant]}`}
    >
      {label}
    </span>
  )
}
