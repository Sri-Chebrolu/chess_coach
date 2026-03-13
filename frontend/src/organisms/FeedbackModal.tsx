import { useState } from 'react'

interface FeedbackModalProps {
  onSubmit: (text: string) => void
  onCancel: () => void
}

export function FeedbackModal({ onSubmit, onCancel }: FeedbackModalProps) {
  const [text, setText] = useState('')

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setText('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative bg-bg-surface border border-border-default w-full max-w-[400px] p-6 flex flex-col gap-4">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 text-text-muted hover:text-text-primary text-[16px] leading-none cursor-pointer"
          aria-label="Close"
        >
          ×
        </button>

        <p className="text-[13px] font-ui uppercase tracking-wide text-text-secondary">
          Feedback
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share your thoughts..."
          rows={4}
          style={{ resize: 'none' }}
          className="px-3 py-2 text-[13px] font-ui text-text-primary bg-bg-elevated border border-border-default placeholder:text-text-muted focus:outline-none"
          autoFocus
        />

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-[12px] font-ui uppercase tracking-wide text-text-muted hover:text-text-secondary border border-border-default transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="px-4 py-1.5 text-[12px] font-ui uppercase tracking-wide bg-accent text-bg-primary hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}
