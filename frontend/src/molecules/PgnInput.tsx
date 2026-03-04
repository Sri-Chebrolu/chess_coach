interface PgnInputProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  disabled?: boolean
  'data-testid'?: string
}

export function PgnInput({ value, onChange, onBlur, error, disabled, 'data-testid': testId }: PgnInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[13px] font-medium text-text-secondary font-ui">PGN Data</label>
      <textarea
        data-testid={testId ?? 'pgn-input'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        rows={6}
        placeholder={`[Event "Casual Game"]\n[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6...`}
        style={{ borderRadius: 0, resize: 'vertical' }}
        className={[
          'w-full px-3 py-2 font-mono text-[13px] text-text-primary',
          'bg-bg-surface border',
          'placeholder:text-text-muted',
          'focus:outline-none focus:border-accent',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          error ? 'border-error' : 'border-border-default',
        ].join(' ')}
      />
      {error && (
        <p className="text-[12px] text-error font-ui">{error}</p>
      )}
    </div>
  )
}
