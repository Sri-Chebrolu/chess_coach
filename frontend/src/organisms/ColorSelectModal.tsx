interface ColorSelectModalProps {
  onSelect: (color: 'white' | 'black') => void
  onCancel: () => void
}

export function ColorSelectModal({ onSelect, onCancel }: ColorSelectModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative bg-bg-surface border border-border-default w-full max-w-[360px] p-6 flex flex-col gap-5">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 text-text-muted hover:text-text-primary text-[16px] leading-none cursor-pointer"
          aria-label="Close"
        >
          ×
        </button>

        <p className="text-[13px] font-ui uppercase tracking-wide text-text-secondary">
          Play as
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => onSelect('white')}
            className="flex-1 flex flex-col items-center gap-2 py-4 border border-border-default bg-bg-elevated hover:bg-bg-primary transition-colors cursor-pointer"
          >
            <span className="text-[28px] leading-none">♔</span>
            <span className="text-[12px] font-ui uppercase tracking-wide text-text-primary">White</span>
          </button>

          <button
            onClick={() => onSelect('black')}
            className="flex-1 flex flex-col items-center gap-2 py-4 border border-border-default bg-bg-elevated hover:bg-bg-primary transition-colors cursor-pointer"
          >
            <span className="text-[28px] leading-none">♚</span>
            <span className="text-[12px] font-ui uppercase tracking-wide text-text-primary">Black</span>
          </button>
        </div>
      </div>
    </div>
  )
}
