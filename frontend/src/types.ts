// ─── Engine & Board ──────────────────────────────────────────────────────────

export interface EngineMove {
  san: string
  score_cp: number
  mate: number | null
  pv: string[]
}

export interface KingSafety {
  attackers: number
  in_check: boolean
  castled: boolean
  pawn_shield: number
}

export interface Heuristics {
  material: {
    white: number
    black: number
    balance: number
    description: string
  }
  center_control: {
    white_controls: number
    black_controls: number
    description: string
  }
  piece_activity: {
    white_activity: number
    black_activity: number
    description: string
  }
  king_safety: {
    white: KingSafety
    black: KingSafety
  }
  pawn_structure: {
    white: string[]
    black: string[]
  }
  tactics: string[]
  development: {
    white: string[]
    black: string[]
  }
}

export interface PgnNav {
  move_index: number
  total_moves: number
  move_display: string
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'coach' | 'system'
  content: string
  timestamp: string
}

// ─── Application State ───────────────────────────────────────────────────────

export interface AnalysisViewState {
  sessionId: string
  currentFen: string
  initialFen: string
  turn: 'White' | 'Black'
  moveHistory: string[]
  topMoves: EngineMove[]
  heuristics: Heuristics | null
  chatMessages: ChatMessage[]
  isCoachThinking: boolean
  pgn: PgnNav | null
}

export type AppState =
  | { view: 'input'; error?: string; prefill?: { fen?: string; pgn?: string } }
  | { view: 'loading'; step: 'validating' | 'engine' | 'coach'; abortController: AbortController }
  | { view: 'analysis'; data: AnalysisViewState }

export type AppAction =
  | { type: 'SUBMIT' }
  | { type: 'SET_ABORT'; abortController: AbortController }
  | { type: 'SET_LOADING_STEP'; step: 'validating' | 'engine' | 'coach' }
  | { type: 'ANALYSIS_READY'; data: AnalysisViewState }
  | { type: 'ERROR'; message: string; prefill?: { fen?: string; pgn?: string } }
  | { type: 'RESET' }
  | { type: 'UPDATE_FEN'; fen: string; turn: 'White' | 'Black' }
  | { type: 'APPEND_CHAT'; message: ChatMessage }
  | { type: 'SET_COACH_THINKING'; thinking: boolean }
  | { type: 'UPDATE_TOP_MOVES'; topMoves: EngineMove[] }
  | { type: 'UPDATE_PGN_NAV'; pgn: PgnNav | null }

// ─── API ─────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  ok: boolean
  data: T | null
  error: { code: string; message: string } | null
  request_id: string
}
