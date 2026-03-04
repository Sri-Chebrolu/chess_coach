interface FenInputProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  disabled?: boolean
  'data-testid'?: string
}

export function FenInput({ value, onChange, onBlur, error, disabled, 'data-testid': testId }: FenInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[13px] font-medium text-text-secondary font-ui">FEN String</label>
      <textarea
        data-testid={testId ?? 'fen-input'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        rows={2}
        placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
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
        <p data-testid="error-message" className="text-[12px] text-error font-ui">
          {error}
        </p>
      )}
    </div>
  )
}
