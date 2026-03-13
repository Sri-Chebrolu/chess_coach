import { useReducer, useCallback, useRef, useEffect } from 'react'
import { InputPanel } from './organisms/InputPanel'
import { ColorSelectModal } from './organisms/ColorSelectModal'
import { FeedbackModal } from './organisms/FeedbackModal'
import { AnalysisLayout } from './organisms/AnalysisLayout'
import { BoardPanel } from './organisms/BoardPanel'
import { CoachPanel } from './organisms/CoachPanel'
import { apiValidate, apiSessionInit, apiAnalyze, apiMove, apiOpponentMove, apiStreamCoach, apiFeedback, ApiError } from './api'
import { mapPositionAnalysis, mapTimeline, mapTimelineUpdate, mapMoveResult, mapPgnMetadata } from './mappers'
import type { AppState, AppAction, AnalysisViewState, CoachMessage, MoveTimelineEntry } from './types'

function getChatAnalysisModeForEntry(
  entry: MoveTimelineEntry | null,
  index: number,
  playerColor: 'white' | 'black',
): 'position' | 'move_comparison' {
  if (!entry || index === 0 || entry.source === 'opponent_play') return 'position'
  const moveCompleteColor = entry.turn === 'Black' ? 'white' : 'black'
  return moveCompleteColor === playerColor ? 'move_comparison' : 'position'
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SUBMIT':
      return { view: 'loading', step: 'validating', abortController: action.abortController }

    case 'SET_LOADING_STEP':
      if (state.view === 'loading') return { ...state, step: action.step }
      if (state.view === 'color_select') return { view: 'loading', step: action.step, abortController: state.abortController }
      return state

    case 'ANALYSIS_READY':
      return { view: 'analysis', data: action.data }

    case 'COLOR_SELECT_NEEDED':
      if (state.view !== 'loading') return state
      return { view: 'color_select', abortController: state.abortController }

    case 'ERROR': {
      if (state.view === 'loading') state.abortController.abort()
      return { view: 'input', error: action.message, prefill: action.prefill }
    }

    case 'RESET': {
      if (state.view === 'loading') state.abortController.abort()
      if (state.view === 'color_select') state.abortController.abort()
      return { view: 'input' }
    }

    case 'NAVIGATE_TIMELINE': {
      if (state.view !== 'analysis') return state
      return {
        ...state,
        data: {
          ...state.data,
          position: {
            ...state.data.position,
            currentFen: action.currentFen,
            previousFen: action.previousFen,
            chatAnalysisMode: action.chatAnalysisMode,
            turn: action.turn,
            currentTimelineIndex: action.index,
            timeline: { ...state.data.position.timeline, currentIndex: action.index },
          },
          analysis: {
            ...state.data.analysis,
            currentAnalysis: action.currentAnalysis,
          },
        },
      }
    }

    case 'SET_ANALYSIS': {
      if (state.view !== 'analysis') return state
      return {
        ...state,
        data: {
          ...state.data,
          analysis: {
            ...state.data.analysis,
            currentAnalysis: action.analysis,
            analysisByFen: { ...state.data.analysis.analysisByFen, [action.fen]: action.analysis },
            isAnalyzingPosition: false,
            analysisError: null,
          },
        },
      }
    }

    case 'SET_ANALYZING_POSITION':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, analysis: { ...state.data.analysis, isAnalyzingPosition: action.analyzing } } }

    case 'TIMELINE_UPDATE': {
      if (state.view !== 'analysis') return state
      const { mode, entries, newCurrentIndex } = action.update
      const current = state.data.position.timeline.entries
      let newEntries: MoveTimelineEntry[]
      if (mode === 'append') {
        newEntries = [...current, ...entries]
      } else if (mode === 'truncate_and_append') {
        newEntries = [...current.slice(0, state.data.position.currentTimelineIndex + 1), ...entries]
      } else {
        newEntries = current
      }
      return {
        ...state,
        data: {
          ...state.data,
          position: {
            ...state.data.position,
            currentTimelineIndex: newCurrentIndex,
            timeline: { entries: newEntries, currentIndex: newCurrentIndex },
          },
        },
      }
    }

    case 'MOVE_EXECUTED': {
      if (state.view !== 'analysis') return state
      return {
        ...state,
        data: {
          ...state.data,
          position: {
            ...state.data.position,
            currentFen: action.positionAfter.fen,
            previousFen: action.positionAfter.previousFen,
            chatAnalysisMode: action.positionAfter.chatAnalysisMode,
            turn: action.positionAfter.turn,
            currentTimelineIndex: action.positionAfter.timelineIndex,
          },
          moveStatus: {
            ...state.data.moveStatus,
            isSubmittingMove: false,
            lastMoveResult: action.moveResult,
          },
        },
      }
    }

    case 'SET_RIGHT_RAIL_TAB':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, rightRail: { ...state.data.rightRail, activeTab: action.tab } } }

    case 'TOGGLE_BEST_LINE':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, rightRail: { ...state.data.rightRail, showBestLine: !state.data.rightRail.showBestLine } } }

    case 'TOGGLE_BEST_MOVE_SOURCE':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, rightRail: { ...state.data.rightRail, showBestMoveSource: !state.data.rightRail.showBestMoveSource } } }

    case 'OPEN_FEEDBACK_MODAL':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, rightRail: { ...state.data.rightRail, feedbackModalOpen: true } } }

    case 'CLOSE_FEEDBACK_MODAL':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, rightRail: { ...state.data.rightRail, feedbackModalOpen: false } } }

    case 'APPEND_CHAT':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, coach: { ...state.data.coach, messages: [...state.data.coach.messages, action.message] } } }

    case 'STREAM_CHAT': {
      if (state.view !== 'analysis') return state
      const msgs = state.data.coach.messages
      const last = msgs[msgs.length - 1]
      if (last?.role === 'coach' && last.streaming) {
        return { ...state, data: { ...state.data, coach: { ...state.data.coach, messages: [...msgs.slice(0, -1), action.message] } } }
      }
      return { ...state, data: { ...state.data, coach: { ...state.data.coach, messages: [...msgs, action.message] } } }
    }

    case 'SET_COACH_STREAMING':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, coach: { ...state.data.coach, isCoachStreaming: action.streaming } } }

    case 'SET_MOVE_STATUS':
      if (state.view !== 'analysis') return state
      return { ...state, data: { ...state.data, moveStatus: { ...state.data.moveStatus, ...action.status } } }

    default:
      return state
  }
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
  const colorRequestRef = useRef<{
    resolve: (color: 'white' | 'black') => void
    reject: (reason?: unknown) => void
  } | null>(null)
  const coachAbortRef = useRef<AbortController | null>(null)

  const streamCoachChat = useCallback((
    body: {
      session_id: string
      analysis_mode: 'position' | 'move_comparison'
      fen_before: string | null
      fen_after: string
      message: string
      player_color: 'white' | 'black'
      side_to_move: 'white' | 'black'
    },
    options: {
      onSkip?: () => void
      onDone?: () => void
      onError?: () => void
    } = {},
  ) => {
    const coachCtrl = new AbortController()
    coachAbortRef.current = coachCtrl
    dispatch({ type: 'SET_COACH_STREAMING', streaming: true })
    const coachTokens: string[] = []

    return apiStreamCoach(
      '/api/chat',
      body,
      {
        onToken: (token) => {
          coachTokens.push(token)
          dispatch({
            type: 'STREAM_CHAT',
            message: {
              role: 'coach',
              content: coachTokens.join(''),
              timestamp: new Date().toISOString(),
              streaming: true,
            },
          })
        },
        onSkip: () => {
          options.onSkip?.()
          dispatch({ type: 'SET_COACH_STREAMING', streaming: false })
        },
        onDone: () => {
          if (coachTokens.length > 0) {
            dispatch({
              type: 'STREAM_CHAT',
              message: { role: 'coach', content: coachTokens.join(''), timestamp: new Date().toISOString() },
            })
          }
          dispatch({ type: 'SET_COACH_STREAMING', streaming: false })
          options.onDone?.()
        },
        onError: (error) => {
          dispatch({ type: 'SET_COACH_STREAMING', streaming: false })
          dispatch({
            type: 'APPEND_CHAT',
            message: { role: 'system', content: `Error: ${error.message}`, timestamp: new Date().toISOString() },
          })
          options.onError?.()
        },
      },
      coachCtrl.signal,
    )
  }, [])

  const requestPlayerColor = useCallback((signal: AbortSignal) => {
    dispatch({ type: 'COLOR_SELECT_NEEDED' })

    return new Promise<'white' | 'black'>((resolve, reject) => {
      const request: NonNullable<typeof colorRequestRef.current> = {
        resolve: (color: 'white' | 'black') => {
          cleanup()
          resolve(color)
        },
        reject: (reason?: unknown) => {
          cleanup()
          reject(reason)
        },
      }

      const onAbort = () => {
        cleanup()
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      }

      const cleanup = () => {
        if (colorRequestRef.current === request) {
          colorRequestRef.current = null
        }
        signal.removeEventListener('abort', onAbort)
      }

      colorRequestRef.current = request

      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
  }, [])

  const handleSubmit = useCallback(async (fen: string, pgn: string, opponentElo: number | null = null) => {
    const ctrl = new AbortController()
    dispatch({ type: 'SUBMIT', abortController: ctrl })

    try {
      dispatch({ type: 'SET_LOADING_STEP', step: 'validating' })

      const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      const effectiveFen = fen || (opponentElo !== null ? STARTING_FEN : null)
      const validated = await apiValidate(
        { fen: effectiveFen, pgn: pgn || null },
        ctrl.signal,
      )
      const vData = validated.data!
      const sourceKind = vData.source_kind

      const playerColor = await requestPlayerColor(ctrl.signal)

      dispatch({ type: 'SET_LOADING_STEP', step: 'engine' })

      const sessionRes = await apiSessionInit(
        { source_kind: sourceKind, fen: fen || null, pgn: pgn || null },
        ctrl.signal,
      )
      const sData = sessionRes.data!

      const analyzeRes = await apiAnalyze(
        { session_id: sData.session_id, fen: sData.initial_position.fen },
        ctrl.signal,
      )
      const aData = analyzeRes.data!
      const analysis = mapPositionAnalysis(aData.analysis)
      const timeline = mapTimeline(sData.timeline)

      const viewState: AnalysisViewState = {
        session: {
          sessionId: sData.session_id,
          sourceKind: sData.source_kind,
          pgnMetadata: sData.pgn_metadata ? mapPgnMetadata(sData.pgn_metadata) : null,
          capabilities: sData.session_capabilities,
          // Keep playerColor in frontend state. A future board-flip feature may let the
          // user change sides dynamically; persisting color on the backend session would
          // force us to keep updating server-side session state to match that UI choice.
          playerColor,
          opponentElo,
        },
        position: {
          initialFen: sData.initial_position.fen,
          currentFen: aData.position.fen,
          previousFen: null,
          chatAnalysisMode: 'position',
          turn: aData.position.turn,
          currentTimelineIndex: timeline.currentIndex,
          timeline,
        },
        analysis: {
          currentAnalysis: analysis,
          analysisByFen: { [aData.position.fen]: analysis },
          isAnalyzingPosition: false,
          analysisError: null,
        },
        coach: {
          messages: [],
          isCoachStreaming: false,
          coachError: null,
        },
        rightRail: {
          activeTab: 'coach',
          showBestLine: false,
          showBestMoveSource: false,
          feedbackModalOpen: false,
        },
        moveStatus: {
          isSubmittingMove: false,
          isWaitingForOpponent: opponentElo !== null && playerColor !== vData.turn.toLowerCase(),
          lastMoveResult: null,
        },
      }

      dispatch({ type: 'ANALYSIS_READY', data: viewState })

      // If the opponent goes first (e.g. player picks Black at starting position),
      // trigger their first move inline — handleOpponentMove can't be used here
      // because it reads from `state`, which hasn't updated to 'analysis' yet.
      if (opponentElo !== null && playerColor !== vData.turn.toLowerCase()) {
        try {
          const oppRes = await apiOpponentMove({
            session_id: sData.session_id,
            fen: sData.initial_position.fen,
            elo: opponentElo,
          })
          if (oppRes.data) {
            const d = oppRes.data
            const timelineUpdate = mapTimelineUpdate(d.timeline_update)
            const analysisAfter = mapPositionAnalysis(d.analysis_after)
            const oppResult = mapMoveResult(d.opponent_move)

            dispatch({ type: 'TIMELINE_UPDATE', update: timelineUpdate })
            dispatch({ type: 'SET_ANALYSIS', fen: d.position_after.fen, analysis: analysisAfter })
            dispatch({
              type: 'MOVE_EXECUTED',
              positionAfter: {
                fen: d.position_after.fen,
                previousFen: sData.initial_position.fen,
                turn: d.position_after.turn,
                timelineIndex: timelineUpdate.newCurrentIndex,
                chatAnalysisMode: 'position',
              },
              moveResult: oppResult,
            })
          }
        } catch {
          dispatch({
            type: 'APPEND_CHAT',
            message: { role: 'system', content: 'Opponent move failed. Try making another move.', timestamp: new Date().toISOString() },
          })
        } finally {
          dispatch({ type: 'SET_MOVE_STATUS', status: { isWaitingForOpponent: false } })
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const message = err instanceof ApiError ? err.message : 'Connection failed. Is the backend running?'
      dispatch({ type: 'ERROR', message, prefill: { fen, pgn } })
    }
  }, [requestPlayerColor])

  const handleNavigate = useCallback(async (index: number) => {
    if (state.view !== 'analysis') return
    const { data } = state
    const entry = data.position.timeline.entries[index]
    if (!entry) return
    const previousFen = index > 0 ? data.position.timeline.entries[index - 1]?.fen ?? null : null
    const currentAnalysis = data.analysis.analysisByFen[entry.fen] ?? null
    const chatAnalysisMode = getChatAnalysisModeForEntry(entry, index, data.session.playerColor)

    dispatch({
      type: 'NAVIGATE_TIMELINE',
      index,
      currentFen: entry.fen,
      previousFen,
      chatAnalysisMode,
      turn: entry.turn,
      currentAnalysis,
    })

    // If we already have cached analysis, skip the fetch
    if (data.analysis.analysisByFen[entry.fen]) return

    dispatch({ type: 'SET_ANALYZING_POSITION', analyzing: true })
    try {
      const res = await apiAnalyze({ session_id: data.session.sessionId, fen: entry.fen })
      if (res.data) {
        dispatch({ type: 'SET_ANALYSIS', fen: entry.fen, analysis: mapPositionAnalysis(res.data.analysis) })
      }
    } catch {
      dispatch({ type: 'SET_ANALYZING_POSITION', analyzing: false })
    }
  }, [state])

  const handleMoveAttempt = useCallback(async (san: string, fenBefore: string) => {
    if (state.view !== 'analysis') return
    const { data } = state

    dispatch({ type: 'SET_MOVE_STATUS', status: { isSubmittingMove: true } })

    // Cancel any in-flight coach stream
    coachAbortRef.current?.abort()

    try {
      const res = await apiMove({
        session_id: data.session.sessionId,
        fen_before: fenBefore,
        move: san,
      })
      if (!res.data) return

      const d = res.data
      const moveResult = mapMoveResult(d.move_result)
      const analysisAfter = mapPositionAnalysis(d.analysis_after)
      const timelineUpdate = mapTimelineUpdate(d.timeline_update)

      if (!moveResult.isLegal) {
        // Rollback
        dispatch({ type: 'SET_MOVE_STATUS', status: { isSubmittingMove: false } })
        dispatch({
          type: 'APPEND_CHAT',
          message: { role: 'system', content: 'Illegal move.', timestamp: new Date().toISOString() },
        })
        return
      }

      dispatch({
        type: 'MOVE_EXECUTED',
        positionAfter: {
          fen: d.position_after.fen,
          previousFen: fenBefore,
          turn: d.position_after.turn,
          timelineIndex: timelineUpdate.newCurrentIndex,
          chatAnalysisMode: 'move_comparison',
        },
        moveResult,
      })
      dispatch({ type: 'TIMELINE_UPDATE', update: timelineUpdate })
      dispatch({ type: 'SET_ANALYSIS', fen: d.position_after.fen, analysis: analysisAfter })

      // Coach stream for move analysis (non-blocking)
      streamCoachChat(
        {
          session_id: data.session.sessionId,
          analysis_mode: 'move_comparison',
          fen_before: fenBefore,
          fen_after: d.position_after.fen,
          message: '',
          player_color: data.session.playerColor,
          side_to_move: d.position_after.turn.toLowerCase() as 'white' | 'black',
        },
        {
          onSkip: () => {
            dispatch({
              type: 'APPEND_CHAT',
              message: { role: 'coach', content: 'Good move!', timestamp: new Date().toISOString() },
            })
          },
          onDone: () => {
            if (data.session.opponentElo) {
              handleOpponentMove(d.position_after.fen)
            }
          },
          onError: () => {
            if (data.session.opponentElo) {
              handleOpponentMove(d.position_after.fen)
            }
          },
        },
      ).catch(() => {})
    } catch (err) {
      dispatch({ type: 'SET_MOVE_STATUS', status: { isSubmittingMove: false } })
      const message = err instanceof Error ? err.message : 'Move failed.'
      dispatch({
        type: 'APPEND_CHAT',
        message: { role: 'system', content: `Analysis failed: ${message}. Try again.`, timestamp: new Date().toISOString() },
      })
    }
  }, [state])

  const handleOpponentMove = useCallback(async (fen: string) => {
    if (state.view !== 'analysis') return
    const { data } = state
    if (!data.session.opponentElo) return

    dispatch({ type: 'SET_MOVE_STATUS', status: { isWaitingForOpponent: true } })

    try {
      const res = await apiOpponentMove({
        session_id: data.session.sessionId,
        fen,
        elo: data.session.opponentElo,
      })
      if (res.data) {
        const d = res.data
        const timelineUpdate = mapTimelineUpdate(d.timeline_update)
        const analysisAfter = mapPositionAnalysis(d.analysis_after)
        const oppResult = mapMoveResult(d.opponent_move)

        dispatch({ type: 'TIMELINE_UPDATE', update: timelineUpdate })
        dispatch({ type: 'SET_ANALYSIS', fen: d.position_after.fen, analysis: analysisAfter })
        dispatch({
          type: 'MOVE_EXECUTED',
          positionAfter: {
            fen: d.position_after.fen,
            previousFen: fen,
            turn: d.position_after.turn,
            timelineIndex: timelineUpdate.newCurrentIndex,
            chatAnalysisMode: 'position',
          },
          moveResult: oppResult,
        })
      }
    } catch {
      dispatch({
        type: 'APPEND_CHAT',
        message: { role: 'system', content: 'Opponent move failed. Try making another move.', timestamp: new Date().toISOString() },
      })
    } finally {
      dispatch({ type: 'SET_MOVE_STATUS', status: { isWaitingForOpponent: false } })
    }
  }, [state])

  const handleChatSubmit = useCallback(async (text: string) => {
    if (state.view !== 'analysis') return
    const { data } = state

    dispatch({ type: 'APPEND_CHAT', message: { role: 'user', content: text, timestamp: new Date().toISOString() } })

    try {
      await streamCoachChat({
        session_id: data.session.sessionId,
        fen_after: data.position.currentFen,
        fen_before: data.position.chatAnalysisMode === 'move_comparison' ? data.position.previousFen : null,
        analysis_mode: data.position.chatAnalysisMode,
        message: text,
        player_color: data.session.playerColor,
        side_to_move: data.position.turn.toLowerCase() as 'white' | 'black',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection lost.'
      dispatch({ type: 'APPEND_CHAT', message: { role: 'system', content: `Error: ${message}`, timestamp: new Date().toISOString() } })
    }
  }, [state, streamCoachChat])

  const handleFeedbackSubmit = useCallback(async (text: string) => {
    if (state.view !== 'analysis') return
    try {
      await apiFeedback({ session_id: state.data.session.sessionId, feedback_text: text })
    } catch {
      // Feedback errors are silent — logging is best-effort
    }
    dispatch({ type: 'CLOSE_FEEDBACK_MODAL' })
  }, [state])

  // Trigger computer's first move when player picks black
  useEffect(() => {
    if (state.view !== 'analysis') return
    const { data } = state
    if (!data.session.opponentElo) return
    if (data.moveStatus.isWaitingForOpponent) return
    if (data.position.currentTimelineIndex !== 0) return
    if (data.position.turn.toLowerCase() === data.session.playerColor) return
    handleOpponentMove(data.position.currentFen)
  }, [state.view]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state.view === 'input') {
    return (
      <InputPanel
        onSubmit={handleSubmit}
        error={state.error}
        prefill={state.prefill}
      />
    )
  }

  if (state.view === 'color_select') {
    return (
      <ColorSelectModal
        onSelect={(color) => { colorRequestRef.current?.resolve(color) }}
        onCancel={() => {
          colorRequestRef.current?.reject(new DOMException('The operation was aborted.', 'AbortError'))
          dispatch({ type: 'RESET' })
        }}
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

  const { data } = state

  return (
    <>
    {data.rightRail.feedbackModalOpen && (
      <FeedbackModal
        onSubmit={handleFeedbackSubmit}
        onCancel={() => dispatch({ type: 'CLOSE_FEEDBACK_MODAL' })}
      />
    )}
    <AnalysisLayout
      boardPanel={
        <BoardPanel
          currentFen={data.position.currentFen}
          turn={data.position.turn}
          playerColor={data.session.playerColor}
          topMoves={data.analysis.currentAnalysis?.topMoves ?? []}
          showBestLine={data.rightRail.showBestLine}
          showBestMoveSource={data.rightRail.showBestMoveSource}
          isSubmittingMove={data.moveStatus.isSubmittingMove}
          isWaitingForOpponent={data.moveStatus.isWaitingForOpponent}
          lastMoveResult={data.moveStatus.lastMoveResult}
          onMoveAttempt={handleMoveAttempt}
        />
      }
      coachPanel={
        <CoachPanel
          currentFen={data.position.currentFen}
          activeTab={data.rightRail.activeTab}
          showBestLine={data.rightRail.showBestLine}
          showBestMoveSource={data.rightRail.showBestMoveSource}
          hasAnalysis={data.analysis.currentAnalysis !== null}
          messages={data.coach.messages}
          isCoachStreaming={data.coach.isCoachStreaming}
          timeline={data.position.timeline}
          currentTimelineIndex={data.position.currentTimelineIndex}
          isSubmittingMove={data.moveStatus.isSubmittingMove}
          onTabChange={(tab) => dispatch({ type: 'SET_RIGHT_RAIL_TAB', tab })}
          onToggleBestLine={() => dispatch({ type: 'TOGGLE_BEST_LINE' })}
          onToggleBestMoveSource={() => dispatch({ type: 'TOGGLE_BEST_MOVE_SOURCE' })}
          onNavigate={handleNavigate}
          onChatSubmit={handleChatSubmit}
          onReset={() => dispatch({ type: 'RESET' })}
          onFeedbackOpen={() => dispatch({ type: 'OPEN_FEEDBACK_MODAL' })}
        />
      }
    />
    </>
  )
}
