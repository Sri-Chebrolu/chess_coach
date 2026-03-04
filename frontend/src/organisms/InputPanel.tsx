import { useState } from 'react'
import { FenInput } from '../molecules/FenInput'
import { PgnInput } from '../molecules/PgnInput'
import { SquareButton } from '../atoms/SquareButton'

interface InputPanelProps {
  onSubmit: (fen: string, pgn: string) => void
  loading?: boolean
  error?: string
  prefill?: { fen?: string; pgn?: string }
}

export function InputPanel({ onSubmit, loading = false, error, prefill }: InputPanelProps) {
  const [fen, setFen] = useState(prefill?.fen ?? '')
  const [pgn, setPgn] = useState(prefill?.pgn ?? '')

  const canSubmit = (fen.trim().length > 0 || pgn.trim().length > 0) && !loading

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-primary px-4">
      <div className="w-full max-w-[560px] flex flex-col gap-4">
        <h1 className="text-[18px] font-semibold font-ui text-text-primary tracking-wide uppercase">
          Socratic Chess Coach
        </h1>

        <FenInput
          value={fen}
          onChange={setFen}
          disabled={loading}
          data-testid="fen-input"
        />

        <PgnInput
          value={pgn}
          onChange={setPgn}
          disabled={loading}
          data-testid="pgn-input"
        />

        <SquareButton
          label="Analyze Position"
          onClick={() => onSubmit(fen, pgn)}
          disabled={!canSubmit}
          loading={loading}
          fullWidth
          data-testid="submit-button"
        />

        {error && (
          <p data-testid="error-message" className="text-[13px] text-error font-ui">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
