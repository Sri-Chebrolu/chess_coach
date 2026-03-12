// ─── Canonical Domain Types (camelCase) ──────────────────────────────────────

export interface EngineMove {
  san: string
  uci: string
  scoreCpWhite: number | null
  mate: number | null
  pv: string[]
  fromSquare: string
  toSquare: string
}

export interface PositionAnalysis {
  topMoves: EngineMove[]
  heuristics: Record<string, unknown>
  scoreSemantics: { perspective: string; normalizedForTurn: boolean }
}

export interface MoveTimelineEntry {
  index: number
  fen: string
  turn: 'White' | 'Black'
  san: string | null
  moveNumberLabel: string | null
  source: 'initial' | 'pgn_mainline' | 'live_play' | 'opponent_play'
}

export interface MoveTimeline {
  entries: MoveTimelineEntry[]
  currentIndex: number
}

export interface MoveExecutionResult {
  moveSan: string
  moveUci: string
  fromSquare: string
  toSquare: string
  promotion: string | null
  isLegal: boolean
  isBestMove: boolean
  userMoveEvalWhite: number | null
  bestMoveEvalWhite: number | null
  deltaCpWhite: number | null
}

export interface PgnMetadata {
  white: string | null
  black: string | null
  event: string | null
  totalHalfMoves: number
  startFen: string
}

export interface CoachMessage {
  role: 'user' | 'coach' | 'system'
  content: string
  timestamp: string
  streaming?: boolean
}

// ─── Application State Slices ────────────────────────────────────────────────

export interface SessionState {
  sessionId: string
  sourceKind: 'fen' | 'pgn'
  pgnMetadata: PgnMetadata | null
  capabilities: Record<string, boolean>
  playerColor: 'white' | 'black'
  opponentElo: number | null
}

export interface PositionState {
  initialFen: string
  currentFen: string
  previousFen: string | null
  chatAnalysisMode: 'position' | 'move_comparison'
  turn: 'White' | 'Black'
  currentTimelineIndex: number
  timeline: MoveTimeline
}

export interface AnalysisState {
  currentAnalysis: PositionAnalysis | null
  analysisByFen: Record<string, PositionAnalysis>
  isAnalyzingPosition: boolean
  analysisError: string | null
}

export interface CoachState {
  messages: CoachMessage[]
  isCoachStreaming: boolean
  coachError: string | null
}

export interface RightRailState {
  activeTab: 'coach' | 'moves'
  showBestLine: boolean
  showBestMoveSource: boolean
}

export interface MoveStatusState {
  isSubmittingMove: boolean
  isWaitingForOpponent: boolean
  lastMoveResult: MoveExecutionResult | null
}

export interface AnalysisViewState {
  session: SessionState
  position: PositionState
  analysis: AnalysisState
  coach: CoachState
  rightRail: RightRailState
  moveStatus: MoveStatusState
}

// ─── App State Machine ───────────────────────────────────────────────────────

export type AppState =
  | { view: 'input'; error?: string; prefill?: { fen?: string; pgn?: string } }
  | { view: 'loading'; step: 'validating' | 'engine' | 'coach'; abortController: AbortController }
  | { view: 'color_select'; abortController: AbortController }
  | { view: 'analysis'; data: AnalysisViewState }

export type AppAction =
  | { type: 'SUBMIT'; abortController: AbortController }
  | { type: 'SET_LOADING_STEP'; step: 'validating' | 'engine' | 'coach' }
  | { type: 'ANALYSIS_READY'; data: AnalysisViewState }
  | { type: 'ERROR'; message: string; prefill?: { fen?: string; pgn?: string } }
  | { type: 'RESET' }
  | { type: 'COLOR_SELECT_NEEDED' }
  | {
      type: 'NAVIGATE_TIMELINE'
      index: number
      currentFen: string
      previousFen: string | null
      chatAnalysisMode: 'position' | 'move_comparison'
      turn: 'White' | 'Black'
      currentAnalysis: PositionAnalysis | null
    }
  | { type: 'SET_ANALYSIS'; fen: string; analysis: PositionAnalysis }
  | { type: 'SET_ANALYZING_POSITION'; analyzing: boolean }
  | { type: 'TIMELINE_UPDATE'; update: { mode: 'append' | 'truncate_and_append' | 'replace_cursor'; entries: MoveTimelineEntry[]; newCurrentIndex: number } }
  | {
      type: 'MOVE_EXECUTED'
      positionAfter: {
        fen: string
        previousFen: string | null
        turn: 'White' | 'Black'
        timelineIndex: number
        chatAnalysisMode: 'position' | 'move_comparison'
      }
      moveResult: MoveExecutionResult
    }
  | { type: 'SET_RIGHT_RAIL_TAB'; tab: 'coach' | 'moves' }
  | { type: 'TOGGLE_BEST_LINE' }
  | { type: 'TOGGLE_BEST_MOVE_SOURCE' }
  | { type: 'APPEND_CHAT'; message: CoachMessage }
  | { type: 'STREAM_CHAT'; message: CoachMessage }
  | { type: 'SET_COACH_STREAMING'; streaming: boolean }
  | { type: 'SET_MOVE_STATUS'; status: Partial<MoveStatusState> }

// ─── API ─────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  ok: boolean
  data: T | null
  error: { code: string; message: string } | null
  request_id: string
}
