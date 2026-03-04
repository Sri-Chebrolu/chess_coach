import { useReducer, useCallback } from 'react'
import { InputPanel } from './organisms/InputPanel'
import { AnalysisLayout } from './organisms/AnalysisLayout'
import { BoardPanel } from './organisms/BoardPanel'
import { CoachPanel } from './organisms/CoachPanel'
import { apiFetch, ApiError } from './api'
import type { AppState, AppAction, AnalysisViewState, ChatMessage, EngineMove, PgnNav } from './types'

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SUBMIT':
      return { view: 'loading', step: 'validating', abortController: action.abortController }

    case 'SET_LOADING_STEP':
      if (state.view !== 'loading') return state
      return { ...state, step: action.step }

    case 'ANALYSIS_READY':
      return { view: 'analysis', data: action.data }

    case 'ERROR': {
      if (state.view === 'loading') state.abortController.abort()
      return { view: 'input', error: action.message, prefill: action.prefill }
    }

    case 'RESET': {
      if (state.view === 'loading') state.abortController.abort()
      return { view: 'input' }
    }

    case 'UPDATE_FEN':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, currentFen: action.fen, turn: action.turn } }

    case 'APPEND_CHAT':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, chatMessages: [...state.data.chatMessages, action.message] } }

    case 'SET_COACH_THINKING':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, isCoachThinking: action.thinking } }

    case 'UPDATE_TOP_MOVES':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, topMoves: action.topMoves } }

    case 'UPDATE_PGN_NAV':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, pgn: action.pgn } }

    default:
      return state
  }
}

// ─── API Response Types ───────────────────────────────────────────────────────

interface ValidateResponseData {
  valid: boolean
  fen: string
  turn: 'White' | 'Black'
  legal_moves: string[]
  pgn_metadata: {
    white?: string
    black?: string
    event?: string
    total_half_moves: number
    fen_at_start: string
  } | null
}

interface AnalyzeResponseData {
  session_id: string
  fen: string
  turn: 'White' | 'Black'
  top_moves: EngineMove[]
  heuristics: AnalysisViewState['heuristics']
  coach_response: string
  pgn_nav: { move_index: number; total_moves: number; move_display: string } | null
}

// ─── Loading overlay ─────────────────────────────────────────────────────────

const stepText = {
  validating: 'Validating positions...',
  engine: 'Running analysis...',
  coach: 'Consulting coach...',
}

function LoadingView({ step, onCancel }: { step: 'validating' | 'engine' | 'coach'; onCancel: () => void }) {
  return (
    <div data-testid="loading-state" className="flex items-center justify-center min-h-screen bg-bg-primary">
      <div className="flex flex-col gap-4 items-start max-w-[560px] w-full px-4">
        <p data-testid="loading-step" className="font-mono text-[14px] text-text-primary blinking-cursor">
          {stepText[step]}
        </p>
        <button
          data-testid="loading-cancel"
          onClick={onCancel}
          className="text-[12px] text-text-muted hover:text-text-secondary font-ui uppercase tracking-wide transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(reducer, { view: 'input' })

  const handleSubmit = useCallback(async (fen: string, pgn: string) => {
    const ctrl = new AbortController()
    dispatch({ type: 'SUBMIT', abortController: ctrl })

    try {
      dispatch({ type: 'SET_LOADING_STEP', step: 'validating' })

      const validated = await apiFetch<ValidateResponseData>(
        '/api/validate',
        { fen: fen || null, pgn: pgn || null },
        ctrl.signal,
      )

      dispatch({ type: 'SET_LOADING_STEP', step: 'engine' })

      const analysis = await apiFetch<AnalyzeResponseData>(
        '/api/analyze',
        { fen: validated.data!.fen, session_id: null, pgn: pgn || null },
        ctrl.signal,
      )

      const d = analysis.data!

      const pgn_nav: PgnNav | null = d.pgn_nav
        ? { move_index: d.pgn_nav.move_index, total_moves: d.pgn_nav.total_moves, move_display: d.pgn_nav.move_display }
        : null

      dispatch({
        type: 'ANALYSIS_READY',
        data: {
          sessionId: d.session_id,
          currentFen: d.fen,
          initialFen: d.fen,
          turn: d.turn,
          moveHistory: [],
          topMoves: d.top_moves,
          heuristics: d.heuristics,
          chatMessages: [
            {
              role: 'coach',
              content: d.coach_response,
              timestamp: new Date().toISOString(),
            },
          ],
          isCoachThinking: false,
          pgn: pgn_nav,
        },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const message = err instanceof ApiError ? err.message : 'Connection failed. Is the backend running?'
      dispatch({ type: 'ERROR', message, prefill: { fen, pgn } })
    }
  }, [])

  if (state.view === 'input') {
    return (
      <InputPanel
        onSubmit={handleSubmit}
        error={state.error}
        prefill={state.prefill}
      />
    )
  }

  if (state.view === 'loading') {
    return (
      <LoadingView
        step={state.step}
        onCancel={() => dispatch({ type: 'RESET' })}
      />
    )
  }

  // Analysis view
  const { data } = state

  return (
    <AnalysisLayout
      boardPanel={
        <BoardPanel
          sessionId={data.sessionId}
          currentFen={data.currentFen}
          turn={data.turn}
          topMoves={data.topMoves}
          pgn={data.pgn}
          onFenChange={(fen, turn) => dispatch({ type: 'UPDATE_FEN', fen, turn })}
          onTopMovesChange={(topMoves) => dispatch({ type: 'UPDATE_TOP_MOVES', topMoves })}
          onCoachMessage={(message) => dispatch({ type: 'APPEND_CHAT', message })}
          onSetThinking={(thinking) => dispatch({ type: 'SET_COACH_THINKING', thinking })}
          onPgnNavigate={(pgn, fen, turn) => {
            dispatch({ type: 'UPDATE_PGN_NAV', pgn })
            dispatch({ type: 'UPDATE_FEN', fen, turn })
          }}
        />
      }
      coachPanel={
        <CoachPanel
          sessionId={data.sessionId}
          currentFen={data.currentFen}
          messages={data.chatMessages}
          isThinking={data.isCoachThinking}
          onNewMessage={(message: ChatMessage) => dispatch({ type: 'APPEND_CHAT', message })}
          onSetThinking={(thinking: boolean) => dispatch({ type: 'SET_COACH_THINKING', thinking })}
          onReset={() => dispatch({ type: 'RESET' })}
        />
      }
    />
  )
}
