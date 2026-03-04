import type { ReactNode } from 'react'

interface AnalysisLayoutProps {
  boardPanel: ReactNode
  coachPanel: ReactNode
}

export function AnalysisLayout({ boardPanel, coachPanel }: AnalysisLayoutProps) {
  return (
    <div
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

// Responsive via a style tag — Tailwind media queries don't cover grid-template-columns dynamically
// Add this to index.css if needed:
// @media (max-width: 768px) {
//   .analysis-layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
// }
