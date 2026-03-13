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
        gap: '16px',
        height: '100vh',
        padding: '16px',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{ overflow: 'hidden' }}>{boardPanel}</div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>{coachPanel}</div>
    </div>
  )
}

// Responsive via a style tag — Tailwind media queries don't cover grid-template-columns dynamically
// Add this to index.css if needed:
// @media (max-width: 768px) {
//   .analysis-layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
// }
