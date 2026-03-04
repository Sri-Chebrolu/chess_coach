const variantMap = {
  primary: 'bg-accent text-bg-primary border border-accent hover:bg-accent-hover hover:border-accent-hover',
  ghost: 'bg-transparent text-text-primary border border-border-default hover:bg-bg-elevated',
  danger: 'bg-transparent text-error border border-error hover:bg-bg-elevated',
}

interface SquareButtonProps {
  label: string
  onClick: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  'data-testid'?: string
}

export function SquareButton({
  label,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  'data-testid': testId,
}: SquareButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={isDisabled}
      style={{ borderRadius: 0 }}
      className={[
        'px-4 py-2 text-[13px] font-ui font-medium tracking-wide uppercase',
        'transition-colors duration-100',
        variantMap[variant],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
      ].join(' ')}
    >
      {loading ? '...' : label}
    </button>
  )
}
