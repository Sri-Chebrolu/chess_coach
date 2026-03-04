/**
 * Mock API responses for E2E tests.
 * Use these when the backend (Stockfish + Anthropic) is not available.
 */

export const validFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

export const validateResponse = {
  ok: true,
  data: {
    valid: true,
    fen: validFen,
    turn: 'Black',
    legal_moves: ['Nf6', 'Nc6', 'd5', 'e5', 'c5'],
    pgn_metadata: null,
  },
  error: null,
  request_id: 'test-validate-id',
}

export const analyzeResponse = {
  ok: true,
  data: {
    session_id: 'test-session-123',
    fen: validFen,
    turn: 'Black',
    top_moves: [
      { san: 'd5', score_cp: 25, mate: null, pv: ['d5', 'exd5', 'Qxd5'] },
      { san: 'e5', score_cp: 15, mate: null, pv: ['e5', 'Nf3', 'Nc6'] },
      { san: 'Nf6', score_cp: 10, mate: null, pv: ['Nf6', 'e5', 'Nd5'] },
    ],
    heuristics: {
      material: { white: 39, black: 39, balance: 0, description: 'Material even' },
      center_control: { white_controls: 3, black_controls: 1, description: 'Center control' },
      piece_activity: { white_activity: 29, black_activity: 22, description: 'Piece activity' },
      king_safety: {
        white: { attackers: 0, in_check: false, castled: false, pawn_shield: 2 },
        black: { attackers: 0, in_check: false, castled: false, pawn_shield: 2 },
      },
      pawn_structure: { white: [], black: [] },
      tactics: [],
      development: { white: ['Ng1', 'Bc1'], black: ['Nb8', 'Ng8', 'Bc8', 'Bf8'] },
    },
    coach_response: 'This position arises after 1. e4. White has staked a claim in the center. Black has several good responses including d5, e5, and Nf6.',
    pgn_nav: null,
  },
  error: null,
  request_id: 'test-analyze-id',
}

export const analyzeResponseWithPgn = {
  ...analyzeResponse,
  data: {
    ...analyzeResponse.data,
    pgn_nav: {
      move_index: 0,
      total_moves: 8,
      move_display: '1. e4 e5 2. Nf3 Nc6 *',
    },
  },
}

export const moveResponse = {
  ok: true,
  data: {
    valid: true,
    fen_after: 'r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2',
    turn_after: 'White',
    user_move: { san: 'Nc6', score_cp: -15, mate: null },
    best_move: { san: 'd5', score_cp: 25, mate: null },
    delta_cp: 40,
    top_moves: [{ san: 'd5', score_cp: 25, mate: null, pv: ['d5', 'exd5', 'Qxd5'] }],
    heuristics_before: {},
    heuristics_after: {},
    coach_response: 'You chose Nc6, developing a knight toward the center. The engine prefers d5 for immediate central counterplay.',
  },
  error: null,
  request_id: 'test-move-id',
}

export const chatResponse = {
  ok: true,
  data: {
    response: 'That\'s a great question. At this point, castling would improve king safety.',
    tokens: { input: 500, output: 50 },
  },
  error: null,
  request_id: 'test-chat-id',
}

export const pgnNavigateResponse = (moveIndex: number) => ({
  ok: true,
  data: {
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    turn: 'White',
    move_index: moveIndex,
    total_moves: 8,
    move_display: '1. e4 e5 2. Nf3 Nc6 *',
    last_move_san: 'Nc6',
    legal_moves: ['Bb5', 'Bc4', 'd4'],
  },
  error: null,
  request_id: 'test-pgn-nav-id',
})

export const invalidFenError = {
  ok: false,
  data: null,
  error: { code: 'INVALID_FEN', message: 'Invalid FEN: expected 6 space-separated fields, got 4' },
  request_id: 'test-error-id',
}
