import { useEffect, useRef, useState } from 'react'
import { ChatBubble } from '../molecules/ChatBubble'
import { MoveTimeline } from './MoveTimeline'
import type { CoachMessage, MoveTimeline as MoveTimelineType } from '../types'

interface CoachPanelProps {
  currentFen: string
  activeTab: 'coach' | 'moves'
  showBestLine: boolean
  showBestMoveSource: boolean
  hasAnalysis: boolean
  messages: CoachMessage[]
  isCoachStreaming: boolean
  timeline: MoveTimelineType
  currentTimelineIndex: number
  isSubmittingMove: boolean
  onTabChange: (tab: 'coach' | 'moves') => void
  onToggleBestLine: () => void
  onToggleBestMoveSource: () => void
  onNavigate: (index: number) => void
  onChatSubmit: (text: string) => void
  onReset: () => void
  onFeedbackOpen: () => void
}

export function CoachPanel({
  activeTab,
  showBestLine,
  showBestMoveSource,
  hasAnalysis,
  messages,
  isCoachStreaming,
  timeline,
  currentTimelineIndex,
  isSubmittingMove,
  onTabChange,
  onToggleBestLine,
  onToggleBestMoveSource,
  onNavigate,
  onChatSubmit,
  onReset,
  onFeedbackOpen,
}: CoachPanelProps) {
  const [input, setInput] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)

  const atStart = currentTimelineIndex === 0
  const atEnd = currentTimelineIndex >= timeline.entries.length - 1

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(isAtBottom)
    if (isAtBottom) setHasNewMessage(false)
  }

  useEffect(() => {
    if (activeTab !== 'coach') return
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setHasNewMessage(true)
    }
  }, [messages.length, isCoachStreaming, activeTab])

  function handleSend() {
    const text = input.trim()
    if (!text || isCoachStreaming) return
    setInput('')
    onChatSubmit(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-surface">
      {/* Header with Reset */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
        <span className="text-[13px] font-semibold uppercase tracking-widest text-text-secondary font-ui">
          Analysis
        </span>
        <div className="flex items-center gap-3">
          <button
            data-testid="feedback-button"
            onClick={onFeedbackOpen}
            className="text-[11px] uppercase tracking-wide text-text-muted hover:text-text-secondary font-ui transition-colors"
          >
            Feedback
          </button>
          <button
            data-testid="reset-button"
            onClick={onReset}
            className="text-[11px] uppercase tracking-wide text-text-muted hover:text-text-secondary font-ui transition-colors"
          >
            New Game
          </button>
        </div>
      </div>

      {/* Tab Row */}
      <div className="flex border-b border-border-default">
        <button
          data-testid="tab-coach"
          onClick={() => onTabChange('coach')}
          className={[
            'flex-1 py-2 text-[12px] uppercase tracking-widest font-ui transition-colors',
            activeTab === 'coach'
              ? 'text-accent border-b-2 border-b-accent font-bold'
              : 'text-text-muted hover:text-text-secondary font-bold',
          ].join(' ')}
        >
          Coach
        </button>
        <button
          data-testid="tab-moves"
          onClick={() => onTabChange('moves')}
          className={[
            'flex-1 py-2 text-[12px] uppercase tracking-widest font-ui transition-colors',
            activeTab === 'moves'
              ? 'text-accent border-b-2 border-b-accent font-bold'
              : 'text-text-muted hover:text-text-secondary font-bold',
          ].join(' ')}
        >
          Moves
        </button>
      </div>

      {/* Nav Toolbar */}
      <div className="flex items-center justify-center gap-1 px-4 py-2 border-b border-border-default">
        <button
          data-testid="nav-start"
          onClick={() => onNavigate(0)}
          disabled={atStart || isSubmittingMove}
          className="px-2 py-1 text-[13px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          &#x25C0;&#x25C0;
        </button>
        <button
          data-testid="nav-prev"
          onClick={() => onNavigate(currentTimelineIndex - 1)}
          disabled={atStart || isSubmittingMove}
          className="px-2 py-1 text-[13px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          &#x25C0;
        </button>
        <button
          data-testid="nav-next"
          onClick={() => onNavigate(currentTimelineIndex + 1)}
          disabled={atEnd || isSubmittingMove}
          className="px-2 py-1 text-[13px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          &#x25B6;
        </button>
        <button
          data-testid="nav-end"
          onClick={() => onNavigate(timeline.entries.length - 1)}
          disabled={atEnd || isSubmittingMove}
          className="px-2 py-1 text-[13px] font-mono text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          &#x25B6;&#x25B6;
        </button>
      </div>

      {/* Hint Toolbar */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-border-default">
        <button
          data-testid="hint-best-line"
          onClick={onToggleBestLine}
          disabled={!hasAnalysis}
          className={[
            'px-3 py-1 text-[12px] font-ui transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
            showBestLine
              ? 'bg-accent/20 text-accent border border-accent'
              : 'text-text-muted hover:text-text-secondary border border-border-default',
          ].join(' ')}
        >
          Best Line
        </button>
        <button
          data-testid="hint-best-source"
          onClick={onToggleBestMoveSource}
          disabled={!hasAnalysis}
          className={[
            'px-3 py-1 text-[12px] font-ui transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
            showBestMoveSource
              ? 'bg-accent/20 text-accent border border-accent'
              : 'text-text-muted hover:text-text-secondary border border-border-default',
          ].join(' ')}
        >
          Best Square
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'coach' ? (
        <>
          {/* Chat composer at top */}
          <div className="border-b border-border-default flex gap-0">
            <textarea
              data-testid="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              rows={2}
              disabled={isCoachStreaming}
              style={{ resize: 'none' }}
              className={[
                'flex-1 px-3 py-2 text-[13px] font-ui text-text-primary',
                'bg-white border-0 border-r border-border-default',
                'placeholder:text-text-muted focus:outline-none',
                'disabled:opacity-40',
              ].join(' ')}
            />
            <button
              data-testid="chat-send"
              onClick={handleSend}
              disabled={!input.trim() || isCoachStreaming}
              className="px-4 text-accent hover:text-accent-hover disabled:opacity-30 disabled:cursor-not-allowed font-mono text-[16px] bg-white transition-colors"
            >
              &rarr;
            </button>
          </div>

          {/* Chat messages scroll below */}
          <div
            ref={containerRef}
            data-testid="chat-history"
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto flex flex-col gap-3 p-3"
          >
            {messages.map((msg, i) => (
              <ChatBubble key={i} {...msg} index={i} />
            ))}

            {isCoachStreaming && messages[messages.length - 1]?.role !== 'coach' && (
              <div
                data-testid="coach-thinking"
                className="px-3 py-2 text-[13px] text-text-muted font-mono blinking-cursor border-b border-border-default"
              >
                Coach is thinking...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {hasNewMessage && !autoScroll && (
            <div className="relative flex justify-center">
              <button
                data-testid="new-message-pill"
                onClick={() => {
                  setAutoScroll(true)
                  setHasNewMessage(false)
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="absolute bottom-2 text-[11px] font-ui uppercase tracking-wide px-3 py-1 bg-accent text-bg-primary"
              >
                New message
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <MoveTimeline
            timeline={timeline}
            currentIndex={currentTimelineIndex}
            onSelectEntry={onNavigate}
          />
        </div>
      )}
    </div>
  )
}
