// Wire types — snake_case, matches backend exactly

export interface ApiPositionSnapshot {
  fen: string
  turn: 'White' | 'Black'
  move_index: number | null
  source_kind: 'fen' | 'pgn'
}

export interface ApiEngineMove {
  san: string
  uci: string
  score_cp_white: number | null
  mate: number | null
  pv: string[]
  from_square: string
  to_square: string
}

export interface ApiPositionAnalysis {
  top_moves: ApiEngineMove[]
  heuristics: Record<string, unknown>
  score_semantics: { perspective: string; normalized_for_turn: boolean }
}

export interface ApiMoveExecutionResult {
  move_san: string
  move_uci: string
  from_square: string
  to_square: string
  promotion: string | null
  is_legal: boolean
  is_best_move: boolean
  user_move_eval_white: number | null
  best_move_eval_white: number | null
  delta_cp_white: number | null
}

export interface ApiTimelineEntry {
  index: number
  fen: string
  turn: 'White' | 'Black'
  san: string | null
  move_number_label: string | null
  source: 'initial' | 'pgn_mainline' | 'live_play' | 'opponent_play'
}

export interface ApiPositionTimeline {
  entries: ApiTimelineEntry[]
  current_index: number
  navigation_mode: 'timeline'
}

export interface ApiTimelineUpdate {
  mode: 'append' | 'truncate_and_append' | 'replace_cursor'
  entries: ApiTimelineEntry[]
  new_current_index: number
}

export interface ApiPgnMetadata {
  white: string | null
  black: string | null
  event: string | null
  total_half_moves: number
  start_fen: string
}

// Endpoint request/response types

export interface ApiValidateRequest {
  fen: string | null
  pgn: string | null
}

export interface ApiValidateResponse {
  data: {
    source_kind: 'fen' | 'pgn'
    canonical_start_fen: string
    turn: 'White' | 'Black'
    legal_moves: string[]
    pgn_metadata: ApiPgnMetadata | null
  }
}

export interface ApiSessionInitRequest {
  source_kind: 'fen' | 'pgn'
  fen: string | null
  pgn: string | null
}

export interface ApiSessionInitResponse {
  data: {
    session_id: string
    source_kind: 'fen' | 'pgn'
    initial_position: ApiPositionSnapshot
    timeline: ApiPositionTimeline
    pgn_metadata: ApiPgnMetadata | null
    session_capabilities: Record<string, boolean>
  }
}

export interface ApiAnalyzeRequest {
  session_id: string
  fen: string
}

export interface ApiAnalyzeResponse {
  data: {
    position: ApiPositionSnapshot
    analysis: ApiPositionAnalysis
  }
}

export interface ApiMoveRequest {
  session_id: string
  fen_before: string
  move: string
  position_context?: Record<string, unknown>
}

export interface ApiMoveResponse {
  data: {
    position_before: ApiPositionSnapshot
    position_after: ApiPositionSnapshot
    move_result: ApiMoveExecutionResult
    analysis_after: ApiPositionAnalysis
    timeline_update: ApiTimelineUpdate
  }
}

export interface ApiChatRequest {
  session_id: string
  analysis_mode: 'position' | 'move_comparison'
  fen_after: string
  fen_before: string | null
  message: string
  player_color: 'white' | 'black'
  side_to_move: 'white' | 'black'
}

export interface ApiOpponentMoveRequest {
  session_id: string
  fen: string
  elo: number
}

export interface ApiOpponentMoveResponse {
  data: {
    position_before: ApiPositionSnapshot
    position_after: ApiPositionSnapshot
    opponent_move: ApiMoveExecutionResult
    analysis_after: ApiPositionAnalysis
    timeline_update: ApiTimelineUpdate
  }
}
