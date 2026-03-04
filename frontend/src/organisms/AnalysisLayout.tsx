import type { ReactNode } from 'react'

interface AnalysisLayoutProps {
  boardPanel: ReactNode
  coachPanel: ReactNode
}

export function AnalysisLayout({ boardPanel, coachPanel }: AnalysisLayoutProps) {
  return (
    <div
      className="analysis-layout"
      style={{
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        gap: '1px',
        height: '100vh',
        background: 'var(--border)',
      }}
    >
      <div style={{ background: 'var(--bg-primary)', overflow: 'hidden' }}>{boardPanel}</div>
      <div style={{ background: 'var(--bg-primary)', overflow: 'hidden' }}>{coachPanel}</div>
    </div>
  )
}
