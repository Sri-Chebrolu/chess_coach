import { useState } from 'react'
import { FenInput } from '../molecules/FenInput'
import { PgnInput } from '../molecules/PgnInput'
import { SquareButton } from '../atoms/SquareButton'

interface InputPanelProps {
  onSubmit: (fen: string, pgn: string, opponentElo: number | null) => void
  loading?: boolean
  error?: string
  prefill?: { fen?: string; pgn?: string }
}

export function InputPanel({ onSubmit, loading = false, error, prefill }: InputPanelProps) {
  const [fen, setFen] = useState(prefill?.fen ?? '')
  const [pgn, setPgn] = useState(prefill?.pgn ?? '')
  const [useOpponent, setUseOpponent] = useState(false)
  const [elo, setElo] = useState(1500)

  const canSubmit = (fen.trim().length > 0 || pgn.trim().length > 0 || useOpponent) && !loading
  const showOpponentOption = pgn.trim().length === 0

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-primary px-4">
      <div className="w-full max-w-[560px] flex flex-col gap-4">
        <h1 className="text-[18px] font-semibold font-ui text-white tracking-wide uppercase">
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

        {showOpponentOption && (
          <div className="flex flex-col gap-2 border border-border-default bg-bg-surface p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useOpponent}
                onChange={(e) => setUseOpponent(e.target.checked)}
                disabled={loading}
                data-testid="opponent-toggle"
                className="accent-accent"
              />
              <span className="text-[13px] font-ui text-text-secondary">
                Play against computer opponent
              </span>
            </label>

            {useOpponent && (
              <div className="flex items-center gap-3">
                <label className="text-[12px] font-mono text-text-muted uppercase tracking-wide">
                  ELO
                </label>
                <input
                  type="range"
                  min={400}
                  max={3000}
                  step={100}
                  value={elo}
                  onChange={(e) => setElo(Number(e.target.value))}
                  disabled={loading}
                  data-testid="elo-slider"
                  className="flex-1 accent-accent"
                />
                <span
                  data-testid="elo-value"
                  className="text-[13px] font-mono text-text-primary w-12 text-right"
                >
                  {elo}
                </span>
              </div>
            )}
          </div>
        )}

        <SquareButton
          label="Analyze Position"
          onClick={() => onSubmit(fen, pgn, useOpponent ? elo : null)}
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
