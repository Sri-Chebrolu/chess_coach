import type { ChatMessage } from '../types'

interface ChatBubbleProps extends ChatMessage {
  index: number
  'data-testid'?: string
}

function renderContent(content: string) {
  // Minimal markdown: **bold**, `code`, *italic*
  const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="font-mono text-[12px] bg-bg-elevated px-1">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return <span key={i}>{part}</span>
  })
}

export function ChatBubble({ role, content, index, 'data-testid': testId }: ChatBubbleProps) {
  const isCoach = role === 'coach'
  const isSystem = role === 'system'

  return (
    <div
      data-testid={testId ?? `chat-message-${index}`}
      className={[
        'px-3 py-2 text-[13px] font-ui leading-relaxed',
        isCoach
          ? 'bg-bg-surface border-l-2 border-l-accent border-b border-border-default'
          : isSystem
          ? 'bg-bg-surface border border-warning text-warning text-[12px] font-mono'
          : 'bg-bg-elevated border border-border-default border-b-0',
      ].join(' ')}
    >
      <div className="text-[10px] uppercase tracking-widest text-text-muted font-ui mb-1">
        {role === 'coach' ? 'Coach' : role === 'user' ? 'You' : 'System'}
      </div>
      <div className="text-text-primary">{renderContent(content)}</div>
    </div>
  )
}
