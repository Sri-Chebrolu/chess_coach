/**
 * Real-backend integration tests — no API mocks.
 * Requires a running FastAPI server + Stockfish.
 *
 * Run with:   INTEGRATION=1 npx playwright test integration
 */
import { test, expect } from '@playwright/test'

const BACKEND = 'http://localhost:8000'
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

test.skip(!process.env.INTEGRATION, 'integration tests require live backend + Stockfish (set INTEGRATION=1)')

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${BACKEND}/api/validate`, { data: { fen: AFTER_E4_FEN, pgn: null } })
  if (!res.ok()) {
    throw new Error(`Backend not reachable at ${BACKEND} — is the server running?`)
  }
})

test('POST /api/validate parses FEN correctly', async ({ request }) => {
  const res = await request.post(`${BACKEND}/api/validate`, { data: { fen: AFTER_E4_FEN, pgn: null } })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.data).toMatchObject({
    source_kind: 'fen',
    canonical_start_fen: AFTER_E4_FEN,
    turn: 'Black',
  })
  expect(Array.isArray(body.data.legal_moves)).toBe(true)
  expect(body.data.legal_moves.length).toBeGreaterThan(0)
})

test('POST /api/validate rejects empty input', async ({ request }) => {
  const res = await request.post(`${BACKEND}/api/validate`, { data: { fen: null, pgn: null } })
  const body = await res.json()
  expect(body.ok).toBe(false)
  expect(body.error.code).toBe('EMPTY_INPUT')
})

test('POST /api/session/init returns valid session with timeline', async ({ request }) => {
  const res = await request.post(`${BACKEND}/api/session/init`, { data: { source_kind: 'fen', fen: AFTER_E4_FEN, pgn: null } })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.ok).toBe(true)
  const d = body.data
  expect(d.session_id).toMatch(/^[0-9a-f-]{36}$/)  // UUID format
  expect(d.source_kind).toBe('fen')
  expect(d.initial_position.fen).toBe(AFTER_E4_FEN)
  expect(d.timeline.entries).toHaveLength(1)
  expect(d.timeline.entries[0]).toMatchObject({ index: 0, fen: AFTER_E4_FEN, source: 'initial' })
})

test('POST /api/analyze returns non-empty top_moves with expected fields', async ({ request }) => {
  // Create session first
  const initRes = await request.post(`${BACKEND}/api/session/init`, { data: { source_kind: 'fen', fen: AFTER_E4_FEN, pgn: null } })
  const { data: { session_id } } = await initRes.json()

  const res = await request.post(`${BACKEND}/api/analyze`, { data: { session_id, fen: AFTER_E4_FEN } })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.data.analysis.top_moves.length).toBeGreaterThan(0)
  for (const move of body.data.analysis.top_moves) {
    expect(move).toHaveProperty('san')
    expect(move).toHaveProperty('uci')
    expect(move).toHaveProperty('score_cp_white')
    expect(move).toHaveProperty('from_square')
    expect(move).toHaveProperty('to_square')
  }
})

test('POST /api/move executes a legal move and appends to timeline', async ({ request }) => {
  const initRes = await request.post(`${BACKEND}/api/session/init`, { data: { source_kind: 'fen', fen: AFTER_E4_FEN, pgn: null } })
  const { data: { session_id } } = await initRes.json()

  const res = await request.post(`${BACKEND}/api/move`, {
    data: { session_id, fen_before: AFTER_E4_FEN, move: 'Nc6' },
  })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.ok).toBe(true)
  const d = body.data
  expect(d.move_result.is_legal).toBe(true)
  expect(d.move_result.move_san).toBe('Nc6')
  expect(d.timeline_update.mode).toBe('append')
  expect(d.timeline_update.entries).toHaveLength(1)
  expect(d.timeline_update.entries[0]).toMatchObject({ san: 'Nc6', source: 'live_play' })
})

test('POST /api/move rejects an illegal move', async ({ request }) => {
  const initRes = await request.post(`${BACKEND}/api/session/init`, { data: { source_kind: 'fen', fen: AFTER_E4_FEN, pgn: null } })
  const { data: { session_id } } = await initRes.json()

  const res = await request.post(`${BACKEND}/api/move`, {
    data: { session_id, fen_before: AFTER_E4_FEN, move: 'e4' },  // e4 already played, illegal
  })
  const body = await res.json()
  expect(body.ok).toBe(false)
})
