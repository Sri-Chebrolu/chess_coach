import type {
  ApiEngineMove,
  ApiPositionAnalysis,
  ApiMoveExecutionResult,
  ApiTimelineEntry,
  ApiPositionTimeline,
  ApiTimelineUpdate,
  ApiPgnMetadata,
} from './api-types'
import type {
  EngineMove,
  PositionAnalysis,
  MoveExecutionResult,
  MoveTimelineEntry,
  MoveTimeline,
  PgnMetadata,
} from './types'

export function mapEngineMove(m: ApiEngineMove): EngineMove {
  return {
    san: m.san,
    uci: m.uci,
    scoreCpWhite: m.score_cp_white,
    mate: m.mate,
    pv: m.pv,
    fromSquare: m.from_square,
    toSquare: m.to_square,
  }
}

export function mapPositionAnalysis(a: ApiPositionAnalysis): PositionAnalysis {
  return {
    topMoves: a.top_moves.map(mapEngineMove),
    heuristics: a.heuristics,
    scoreSemantics: {
      perspective: a.score_semantics.perspective,
      normalizedForTurn: a.score_semantics.normalized_for_turn,
    },
  }
}

export function mapMoveResult(r: ApiMoveExecutionResult): MoveExecutionResult {
  return {
    moveSan: r.move_san,
    moveUci: r.move_uci,
    fromSquare: r.from_square,
    toSquare: r.to_square,
    promotion: r.promotion,
    isLegal: r.is_legal,
    isBestMove: r.is_best_move,
    userMoveEvalWhite: r.user_move_eval_white,
    bestMoveEvalWhite: r.best_move_eval_white,
    deltaCpWhite: r.delta_cp_white,
  }
}

export function mapTimelineEntry(e: ApiTimelineEntry): MoveTimelineEntry {
  return {
    index: e.index,
    fen: e.fen,
    turn: e.turn,
    san: e.san,
    moveNumberLabel: e.move_number_label,
    source: e.source,
  }
}

export function mapTimeline(t: ApiPositionTimeline): MoveTimeline {
  return {
    entries: t.entries.map(mapTimelineEntry),
    currentIndex: t.current_index,
  }
}

export function mapTimelineUpdate(u: ApiTimelineUpdate): {
  mode: 'append' | 'truncate_and_append' | 'replace_cursor'
  entries: MoveTimelineEntry[]
  newCurrentIndex: number
} {
  return {
    mode: u.mode,
    entries: u.entries.map(mapTimelineEntry),
    newCurrentIndex: u.new_current_index,
  }
}

export function mapPgnMetadata(m: ApiPgnMetadata): PgnMetadata {
  return {
    white: m.white,
    black: m.black,
    event: m.event,
    totalHalfMoves: m.total_half_moves,
    startFen: m.start_fen,
  }
}
