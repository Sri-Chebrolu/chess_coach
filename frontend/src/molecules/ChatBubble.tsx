import type { CoachMessage } from '../types'

interface ChatBubbleProps extends CoachMessage {
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
        <code key={i} className="font-mono text-[13px] bg-bg-primary px-1 rounded-sm">
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

function CoachAvatar() {
  return (
    <div className="w-7 h-7 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M19 22H5v-2h14v2M13 2c-1.25 0-2.42.62-3.11 1.66L7 8l2 2 2.06-2.06C11.28 8.62 12 9.37 12 10.3V16h2V10.3c0-.93.72-1.68 1.94-2.36L18 10l2-2-2.89-4.34C16.42 2.62 15.25 2 14 2h-1Z"
          fill="white"
        />
      </svg>
    </div>
  )
}

export function ChatBubble({ role, content, index, 'data-testid': testId }: ChatBubbleProps) {
  const isCoach = role === 'coach'
  const isUser = role === 'user'
  const isSystem = role === 'system'

  if (isSystem) {
    return (
      <div
        data-testid={testId ?? `chat-message-${index}`}
        className="px-3 py-2 text-[13px] font-mono leading-[1.7] bg-bg-surface border border-warning text-warning"
      >
        <div className="text-[10px] uppercase tracking-widest text-text-muted font-ui mb-1">
          System
        </div>
        <div>{renderContent(content)}</div>
      </div>
    )
  }

  return (
    <div
      data-testid={testId ?? `chat-message-${index}`}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {isCoach && (
        <div className="flex flex-col items-center mr-2 mt-1">
          <CoachAvatar />
        </div>
      )}
      <div
        className={[
          'px-4 py-3 text-[15px] font-ui leading-[1.7] max-w-[85%]',
          isUser
            ? 'bg-accent text-white'
            : 'bg-bg-elevated text-text-primary',
        ].join(' ')}
      >
        {isCoach && (
          <div className="text-[11px] font-medium text-text-secondary mb-1">Coach</div>
        )}
        <div>{renderContent(content)}</div>
      </div>
    </div>
  )
}
