import { useEffect, useRef, useState } from 'react'
import { ChatBubble } from '../molecules/ChatBubble'
import { SquareButton } from '../atoms/SquareButton'
import { apiFetch } from '../api'
import type { ChatMessage } from '../types'

interface CoachPanelProps {
  sessionId: string
  currentFen: string
  messages: ChatMessage[]
  isThinking: boolean
  onNewMessage: (message: ChatMessage) => void
  onSetThinking: (thinking: boolean) => void
  onReset: () => void
}

interface ChatResponse {
  response: string
}

export function CoachPanel({
  sessionId,
  currentFen,
  messages,
  isThinking,
  onNewMessage,
  onSetThinking,
  onReset,
}: CoachPanelProps) {
  const [input, setInput] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(isAtBottom)
    if (isAtBottom) setHasNewMessage(false)
  }

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setHasNewMessage(true)
    }
  }, [messages.length, isThinking])

  async function handleSend() {
    const text = input.trim()
    if (!text || isThinking) return

    setInput('')
    onNewMessage({ role: 'user', content: text, timestamp: new Date().toISOString() })
    onSetThinking(true)

    try {
      const res = await apiFetch<ChatResponse>('/api/chat', {
        session_id: sessionId,
        message: text,
        fen: currentFen,
      })
      if (res.data) {
        onNewMessage({ role: 'coach', content: res.data.response, timestamp: new Date().toISOString() })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection lost.'
      onNewMessage({ role: 'system', content: `Error: ${message}`, timestamp: new Date().toISOString() })
    } finally {
      onSetThinking(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-default">
        <span className="text-[13px] font-semibold uppercase tracking-widest text-text-secondary font-ui">
          Coach
        </span>
        <button
          data-testid="reset-button"
          onClick={onReset}
          className="text-[11px] uppercase tracking-wide text-text-muted hover:text-text-secondary font-ui transition-colors"
        >
          New Game
        </button>
      </div>

      {/* Chat history */}
      <div
        ref={containerRef}
        data-testid="chat-history"
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto flex flex-col"
      >
        {messages.map((msg, i) => (
          <ChatBubble key={i} {...msg} index={i} />
        ))}

        {isThinking && (
          <div
            data-testid="coach-thinking"
            className="px-3 py-2 text-[13px] text-text-muted font-mono blinking-cursor border-b border-border-default"
          >
            Coach is thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* New message pill */}
      {hasNewMessage && !autoScroll && (
        <div className="relative flex justify-center">
          <button
            data-testid="new-message-pill"
            onClick={() => {
              setAutoScroll(true)
              setHasNewMessage(false)
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }}
            style={{ borderRadius: 0 }}
            className="absolute bottom-2 text-[11px] font-ui uppercase tracking-wide px-3 py-1 bg-accent text-bg-primary"
          >
            New message
          </button>
        </div>
      )}

      {/* Chat input */}
      <div className="border-t border-border-default flex gap-0">
        <textarea
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          rows={2}
          disabled={isThinking}
          style={{ borderRadius: 0, resize: 'none' }}
          className={[
            'flex-1 px-3 py-2 text-[13px] font-ui text-text-primary',
            'bg-bg-surface border-0 border-r border-border-default',
            'placeholder:text-text-muted focus:outline-none',
            'disabled:opacity-40',
          ].join(' ')}
        />
        <button
          data-testid="chat-send"
          onClick={handleSend}
          disabled={!input.trim() || isThinking}
          className="px-4 text-accent hover:text-accent-hover disabled:opacity-30 disabled:cursor-not-allowed font-mono text-[16px] bg-bg-surface transition-colors"
        >
          →
        </button>
      </div>
    </div>
  )
}
