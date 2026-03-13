import { test, expect } from '@playwright/test'

// ─── FEN constants ────────────────────────────────────────────────────────────

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_E5_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const AFTER_NC6_FEN = 'r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2'
const AFTER_NF3_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chatStream(text: string) {
  return [
    'event: start',
    'data: {}',
    '',
    'event: token',
    `data: ${JSON.stringify({ token: text })}`,
    '',
    'event: done',
    'data: {}',
    '',
  ].join('\n')
}

function cloneRequestBody(body: Record<string, unknown> | undefined) {
  return JSON.parse(JSON.stringify(body ?? {})) as Record<string, unknown>
}

function analysisFor(fen: string) {
  const turn = fen.includes(' w ') ? 'White' : 'Black'
  return {
    ok: true,
    data: {
      position: { fen, turn, move_index: 0, source_kind: 'fen' },
      analysis: {
        top_moves: [{ san: 'd5', uci: 'd7d5', from_square: 'd7', to_square: 'd5', score_cp_white: 20, mate: null, pv: ['d5'] }],
        heuristics: {
          material: { white: 39, black: 39 },
          king_safety: { white: { in_check: false }, black: { in_check: false } },
        },
        score_semantics: { perspective: 'white', normalized_for_turn: false },
      },
    },
    error: null,
    request_id: `analyze-${Math.random()}`,
  }
}

function opponentMoveResponse(fenBefore: string, fenAfter: string, san: string, uci: string, from: string, to: string, index: number) {
  const turn = fenAfter.includes(' w ') ? 'White' : 'Black'
  return {
    ok: true,
    data: {
      position_before: { fen: fenBefore, turn: fenBefore.includes(' w ') ? 'White' : 'Black', move_index: index - 1, source_kind: 'fen' },
      position_after: { fen: fenAfter, turn, move_index: index, source_kind: 'fen' },
      opponent_move: { move_san: san, move_uci: uci, from_square: from, to_square: to, promotion: null, is_legal: true, is_best_move: true, user_move_eval_white: 0, best_move_eval_white: 0, delta_cp_white: 0 },
      analysis_after: analysisFor(fenAfter).data.analysis,
      timeline_update: {
        mode: 'append',
        entries: [{ index, fen: fenAfter, turn, san, move_number_label: `${Math.ceil(index / 2)}.${index % 2 === 0 ? '..' : ''}`, source: 'opponent_play' }],
        new_current_index: index,
      },
    },
    error: null,
    request_id: `opp-${Math.random()}`,
  }
}

// ─── Session loaders ──────────────────────────────────────────────────────────

/**
 * Sets up an opponent-mode session where the player is White.
 * Handles validate, session/init, analyze, move (sequential), opponent-move (sequential), chat.
 */
async function loadOpponentSessionAsWhite(
  page: import('@playwright/test').Page,
  chatRequests: Array<Record<string, unknown>>,
  moveResponses: object[],
  oppMoveResponses: object[],
) {
  let moveCallIndex = 0
  let oppMoveCallIndex = 0

  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const body = route.request().postDataJSON?.() as Record<string, unknown> | undefined

    if (url.includes('/api/validate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { source_kind: 'fen', canonical_start_fen: STARTING_FEN, turn: 'White', legal_moves: ['e4', 'd4', 'Nf3'], pgn_metadata: null },
          error: null,
          request_id: 'validate-opp',
        }),
      })
      return
    }

    if (url.includes('/api/session/init')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            session_id: 'session-opp-white',
            source_kind: 'fen',
            initial_position: { fen: STARTING_FEN, turn: 'White', move_index: 0, source_kind: 'fen' },
            timeline: {
              entries: [{ index: 0, fen: STARTING_FEN, turn: 'White', san: null, move_number_label: null, source: 'initial' }],
              current_index: 0,
              navigation_mode: 'timeline',
            },
            pgn_metadata: null,
            session_capabilities: { opponent_mode: true },
          },
          error: null,
          request_id: 'session-opp-white',
        }),
      })
      return
    }

    if (url.includes('/api/analyze')) {
      const fen = (body?.fen as string) ?? STARTING_FEN
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFor(fen)) })
      return
    }

    if (url.includes('/api/move')) {
      const resp = moveResponses[moveCallIndex++] ?? moveResponses[moveResponses.length - 1]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) })
      return
    }

    if (url.includes('/api/opponent-move')) {
      const resp = oppMoveResponses[oppMoveCallIndex++] ?? oppMoveResponses[oppMoveResponses.length - 1]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) })
      return
    }

    if (url.includes('/api/chat')) {
      chatRequests.push(cloneRequestBody(body))
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: chatStream('How does that change the position?') })
      return
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'UNKNOWN', message: 'Unknown' }, request_id: 'unknown' }) })
  })

  await page.goto('/')
  await page.getByTestId('fen-input').fill(STARTING_FEN)
  await page.getByTestId('opponent-toggle').click()
  await page.getByTestId('submit-button').click()
  await page.getByRole('button', { name: 'White' }).click()
  await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })
}

/**
 * Sets up an opponent-mode session where the player is Black.
 * The computer (White) moves first automatically on load.
 */
async function loadOpponentSessionAsBlack(
  page: import('@playwright/test').Page,
  chatRequests: Array<Record<string, unknown>>,
  moveResponses: object[],
  oppMoveResponses: object[],
) {
  let moveCallIndex = 0
  let oppMoveCallIndex = 0

  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const body = route.request().postDataJSON?.() as Record<string, unknown> | undefined

    if (url.includes('/api/validate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { source_kind: 'fen', canonical_start_fen: STARTING_FEN, turn: 'White', legal_moves: ['e4', 'd4', 'Nf3'], pgn_metadata: null },
          error: null,
          request_id: 'validate-opp-black',
        }),
      })
      return
    }

    if (url.includes('/api/session/init')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            session_id: 'session-opp-black',
            source_kind: 'fen',
            initial_position: { fen: STARTING_FEN, turn: 'White', move_index: 0, source_kind: 'fen' },
            timeline: {
              entries: [{ index: 0, fen: STARTING_FEN, turn: 'White', san: null, move_number_label: null, source: 'initial' }],
              current_index: 0,
              navigation_mode: 'timeline',
            },
            pgn_metadata: null,
            session_capabilities: { opponent_mode: true },
          },
          error: null,
          request_id: 'session-opp-black',
        }),
      })
      return
    }

    if (url.includes('/api/analyze')) {
      const fen = (body?.fen as string) ?? STARTING_FEN
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFor(fen)) })
      return
    }

    if (url.includes('/api/move')) {
      const resp = moveResponses[moveCallIndex++] ?? moveResponses[moveResponses.length - 1]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) })
      return
    }

    if (url.includes('/api/opponent-move')) {
      const resp = oppMoveResponses[oppMoveCallIndex++] ?? oppMoveResponses[oppMoveResponses.length - 1]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) })
      return
    }

    if (url.includes('/api/chat')) {
      chatRequests.push(cloneRequestBody(body))
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: chatStream('How does that change the position?') })
      return
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'UNKNOWN', message: 'Unknown' }, request_id: 'unknown' }) })
  })

  await page.goto('/')
  await page.getByTestId('fen-input').fill(STARTING_FEN)
  await page.getByTestId('opponent-toggle').click()
  await page.getByTestId('submit-button').click()
  await page.getByRole('button', { name: 'Black' }).click()
  await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })
}

// ─── Scenario A: FEN flow — full multi-step session ───────────────────────────

test.describe('Scenario A: FEN flow — full multi-step session', () => {
  test('init → position chat → move → auto move_comparison chat → follow-up chat preserves context', async ({ page }) => {
    // Reuse loadFenSession from chat-routing.spec.ts by duplicating its setup inline
    const chatRequests: Array<Record<string, unknown>> = []

    const startFen = AFTER_E4_FEN
    const afterNc6 = AFTER_NC6_FEN

    await page.route('**/api/**', async (route) => {
      const url = route.request().url()
      const body = route.request().postDataJSON?.() as Record<string, unknown> | undefined

      if (url.includes('/api/validate')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { source_kind: 'fen', canonical_start_fen: startFen, turn: 'Black', legal_moves: ['Nc6', 'Nf6', 'd5'], pgn_metadata: null }, error: null, request_id: 'validate-fen' }) })
        return
      }
      if (url.includes('/api/session/init')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { session_id: 'session-fen', source_kind: 'fen', initial_position: { fen: startFen, turn: 'Black', move_index: 0, source_kind: 'fen' }, timeline: { entries: [{ index: 0, fen: startFen, turn: 'Black', san: null, move_number_label: null, source: 'initial' }], current_index: 0, navigation_mode: 'timeline' }, pgn_metadata: null, session_capabilities: { opponent_mode: false } }, error: null, request_id: 'session-fen' }) })
        return
      }
      if (url.includes('/api/analyze')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFor((body?.fen as string) ?? startFen)) })
        return
      }
      if (url.includes('/api/move')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { position_before: { fen: startFen, turn: 'Black', move_index: 0, source_kind: 'fen' }, position_after: { fen: afterNc6, turn: 'White', move_index: 1, source_kind: 'fen' }, move_result: { move_san: 'Nc6', move_uci: 'b8c6', from_square: 'b8', to_square: 'c6', promotion: null, is_legal: true, is_best_move: false, user_move_eval_white: 10, best_move_eval_white: 25, delta_cp_white: -15 }, analysis_after: analysisFor(afterNc6).data.analysis, timeline_update: { mode: 'append', entries: [{ index: 1, fen: afterNc6, turn: 'White', san: 'Nc6', move_number_label: '1...', source: 'live_play' }], new_current_index: 1 } }, error: null, request_id: 'move-nc6' }) })
        return
      }
      if (url.includes('/api/chat')) {
        chatRequests.push(cloneRequestBody(body))
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: chatStream('Knight development, consider the center.') })
        return
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'UNKNOWN', message: 'Unknown' }, request_id: 'unknown' }) })
    })

    await page.goto('/')
    await page.getByTestId('fen-input').fill(startFen)
    await page.getByTestId('submit-button').click()
    await page.getByRole('button', { name: 'Black' }).click()
    await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })

    // Initial state: nav-prev disabled (single timeline entry)
    await expect(page.getByTestId('nav-prev')).toBeDisabled()

    // Step 1: send position chat from initial position
    await page.getByTestId('chat-input').fill('What are my options here?')
    await page.getByTestId('chat-send').click()
    await expect.poll(() => chatRequests.length).toBe(1)

    expect(chatRequests[0]).toMatchObject({
      session_id: 'session-fen',
      analysis_mode: 'position',
      fen_after: startFen,
      fen_before: null,
      player_color: 'black',
      message: 'What are my options here?',
    })

    // Step 2: play Nc6 — auto-chat should fire in move_comparison mode
    await page.locator('[data-square="b8"]').click()
    await page.locator('[data-square="c6"]').click()
    await expect.poll(() => chatRequests.length).toBe(2)

    expect(chatRequests[1]).toMatchObject({
      session_id: 'session-fen',
      analysis_mode: 'move_comparison',
      fen_after: afterNc6,
      fen_before: startFen,
      player_color: 'black',
      side_to_move: 'white',
      message: '',
    })

    // nav-prev should now be enabled (two timeline entries)
    await expect(page.getByTestId('nav-prev')).toBeEnabled()

    // Step 3: follow-up chat — context (fen_before) must still be preserved
    await page.getByTestId('chat-input').fill('Why is Nc6 worse than d5?')
    await page.getByTestId('chat-send').click()
    await expect.poll(() => chatRequests.length).toBe(3)

    expect(chatRequests[2]).toMatchObject({
      session_id: 'session-fen',
      analysis_mode: 'move_comparison',
      fen_after: afterNc6,
      fen_before: startFen,        // must NOT be reset after follow-up
      player_color: 'black',
      message: 'Why is Nc6 worse than d5?',
    })
  })

  test('session_id is propagated to every API call after session init', async ({ page }) => {
    const allRequests: Record<string, Record<string, unknown>> = {}

    await page.route('**/api/**', async (route) => {
      const url = route.request().url()
      const body = route.request().postDataJSON?.() as Record<string, unknown> | undefined

      const key = url.split('/api/')[1]?.split('?')[0] ?? url
      if (body) allRequests[key] = body

      if (url.includes('/api/validate')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { source_kind: 'fen', canonical_start_fen: AFTER_E4_FEN, turn: 'Black', legal_moves: ['Nc6'], pgn_metadata: null }, error: null, request_id: 'v' }) })
        return
      }
      if (url.includes('/api/session/init')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { session_id: 'session-prop-test', source_kind: 'fen', initial_position: { fen: AFTER_E4_FEN, turn: 'Black', move_index: 0, source_kind: 'fen' }, timeline: { entries: [{ index: 0, fen: AFTER_E4_FEN, turn: 'Black', san: null, move_number_label: null, source: 'initial' }], current_index: 0, navigation_mode: 'timeline' }, pgn_metadata: null, session_capabilities: { opponent_mode: false } }, error: null, request_id: 's' }) })
        return
      }
      if (url.includes('/api/analyze')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFor((body?.fen as string) ?? AFTER_E4_FEN)) })
        return
      }
      if (url.includes('/api/chat')) {
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: chatStream('Good.') })
        return
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'UNKNOWN', message: 'Unknown' }, request_id: 'unknown' }) })
    })

    await page.goto('/')
    await page.getByTestId('fen-input').fill(AFTER_E4_FEN)
    await page.getByTestId('submit-button').click()
    await page.getByRole('button', { name: 'Black' }).click()
    await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })

    await page.getByTestId('chat-input').fill('Test')
    await page.getByTestId('chat-send').click()
    await page.waitForTimeout(500)

    // validate and session/init don't have session_id (correct — they create/don't need one)
    expect(allRequests['validate']).not.toHaveProperty('session_id')
    expect(allRequests['session/init']).not.toHaveProperty('session_id')

    // analyze and chat must carry the session_id
    expect(allRequests['analyze']).toMatchObject({ session_id: 'session-prop-test' })
    expect(allRequests['chat']).toMatchObject({ session_id: 'session-prop-test' })
  })
})

// ─── Scenario B: Opponent mode — player is White ─────────────────────────────

test.describe('Scenario B: Opponent mode — player is White', () => {
  test('player move → auto move_comparison chat → opponent responds → position chat → player second move', async ({ page }) => {
    const chatRequests: Array<Record<string, unknown>> = []

    const e4Move = {
      ok: true,
      data: {
        position_before: { fen: STARTING_FEN, turn: 'White', move_index: 0, source_kind: 'fen' },
        position_after: { fen: AFTER_E4_FEN, turn: 'Black', move_index: 1, source_kind: 'fen' },
        move_result: { move_san: 'e4', move_uci: 'e2e4', from_square: 'e2', to_square: 'e4', promotion: null, is_legal: true, is_best_move: true, user_move_eval_white: 20, best_move_eval_white: 20, delta_cp_white: 0 },
        analysis_after: analysisFor(AFTER_E4_FEN).data.analysis,
        timeline_update: { mode: 'append', entries: [{ index: 1, fen: AFTER_E4_FEN, turn: 'Black', san: 'e4', move_number_label: '1.', source: 'live_play' }], new_current_index: 1 },
      },
      error: null,
      request_id: 'move-e4',
    }
    const nf3Move = {
      ok: true,
      data: {
        position_before: { fen: AFTER_E5_FEN, turn: 'White', move_index: 2, source_kind: 'fen' },
        position_after: { fen: AFTER_NF3_FEN, turn: 'Black', move_index: 3, source_kind: 'fen' },
        move_result: { move_san: 'Nf3', move_uci: 'g1f3', from_square: 'g1', to_square: 'f3', promotion: null, is_legal: true, is_best_move: false, user_move_eval_white: 15, best_move_eval_white: 25, delta_cp_white: -10 },
        analysis_after: analysisFor(AFTER_NF3_FEN).data.analysis,
        timeline_update: { mode: 'append', entries: [{ index: 3, fen: AFTER_NF3_FEN, turn: 'Black', san: 'Nf3', move_number_label: '2.', source: 'live_play' }], new_current_index: 3 },
      },
      error: null,
      request_id: 'move-nf3',
    }
    const e5Opp = opponentMoveResponse(AFTER_E4_FEN, AFTER_E5_FEN, 'e5', 'e7e5', 'e7', 'e5', 2)

    await loadOpponentSessionAsWhite(page, chatRequests, [e4Move, nf3Move], [e5Opp])

    // Play e4
    await page.locator('[data-square="e2"]').click()
    await page.locator('[data-square="e4"]').click()

    // Auto-chat fires in move_comparison mode after e4
    await expect.poll(() => chatRequests.length).toBe(1)
    expect(chatRequests[0]).toMatchObject({
      session_id: 'session-opp-white',
      analysis_mode: 'move_comparison',
      fen_after: AFTER_E4_FEN,
      fen_before: STARTING_FEN,
      message: '',
    })

    // Opponent plays e5 (triggered after chat onDone) — wait for timeline to update
    await page.getByTestId('tab-moves').click()
    await expect(page.getByRole('button', { name: 'e5' })).toBeVisible()
    await page.getByTestId('tab-coach').click()

    // Chat from Black's position (opponent's move) — must be position mode
    await page.getByTestId('chat-input').fill('How should I respond to e5?')
    await page.getByTestId('chat-send').click()
    await expect.poll(() => chatRequests.length).toBe(2)

    expect(chatRequests[1]).toMatchObject({
      session_id: 'session-opp-white',
      analysis_mode: 'position',
      fen_before: null,
      fen_after: AFTER_E5_FEN,
    })

    // Play Nf3 — auto-chat fires in move_comparison mode
    await page.locator('[data-square="g1"]').click()
    await page.locator('[data-square="f3"]').click()
    await expect.poll(() => chatRequests.length).toBe(3)

    expect(chatRequests[2]).toMatchObject({
      session_id: 'session-opp-white',
      analysis_mode: 'move_comparison',
      fen_after: AFTER_NF3_FEN,
      fen_before: AFTER_E5_FEN,
      message: '',
    })
  })
})

// ─── Scenario C: Opponent mode — player is Black, computer moves first ────────

test.describe('Scenario C: Opponent mode — player is Black, computer moves first', () => {
  test('computer moves first automatically on load, then player responds', async ({ page }) => {
    const chatRequests: Array<Record<string, unknown>> = []

    const e4Opp = opponentMoveResponse(STARTING_FEN, AFTER_E4_FEN, 'e4', 'e2e4', 'e2', 'e4', 1)
    const nf3Opp = opponentMoveResponse(AFTER_E5_FEN, AFTER_NF3_FEN, 'Nf3', 'g1f3', 'g1', 'f3', 3)
    const e5Move = {
      ok: true,
      data: {
        position_before: { fen: AFTER_E4_FEN, turn: 'Black', move_index: 1, source_kind: 'fen' },
        position_after: { fen: AFTER_E5_FEN, turn: 'White', move_index: 2, source_kind: 'fen' },
        move_result: { move_san: 'e5', move_uci: 'e7e5', from_square: 'e7', to_square: 'e5', promotion: null, is_legal: true, is_best_move: false, user_move_eval_white: -20, best_move_eval_white: -5, delta_cp_white: 15 },
        analysis_after: analysisFor(AFTER_E5_FEN).data.analysis,
        timeline_update: { mode: 'append', entries: [{ index: 2, fen: AFTER_E5_FEN, turn: 'White', san: 'e5', move_number_label: '1...', source: 'live_play' }], new_current_index: 2 },
      },
      error: null,
      request_id: 'move-e5',
    }

    await loadOpponentSessionAsBlack(page, chatRequests, [e5Move], [e4Opp, nf3Opp])

    // Computer (White) should move first automatically — wait for the timeline to advance
    await expect(page.getByTestId('nav-prev')).toBeEnabled({ timeout: 10000 })

    // Chat after opponent's first move — must be position mode (it was opponent's move)
    await page.getByTestId('chat-input').fill('What are my options after e4?')
    await page.getByTestId('chat-send').click()
    await expect.poll(() => chatRequests.length).toBe(1)

    expect(chatRequests[0]).toMatchObject({
      session_id: 'session-opp-black',
      analysis_mode: 'position',
      fen_after: AFTER_E4_FEN,
      fen_before: null,
    })

    // Player plays e5
    await page.locator('[data-square="e7"]').click()
    await page.locator('[data-square="e5"]').click()

    // Auto-chat fires in move_comparison mode after player's e5
    await expect.poll(() => chatRequests.length).toBe(2)
    expect(chatRequests[1]).toMatchObject({
      session_id: 'session-opp-black',
      analysis_mode: 'move_comparison',
      fen_after: AFTER_E5_FEN,
      fen_before: AFTER_E4_FEN,
      message: '',
    })

    // Opponent (White) responds with Nf3 — wait for timeline to update
    await page.getByTestId('tab-moves').click()
    await expect(page.getByRole('button', { name: 'Nf3' })).toBeVisible({ timeout: 10000 })
    await page.getByTestId('tab-coach').click()

    // Chat after Nf3 (opponent's move) — must be position mode again
    await page.getByTestId('chat-input').fill('How should I continue?')
    await page.getByTestId('chat-send').click()
    await expect.poll(() => chatRequests.length).toBe(3)

    expect(chatRequests[2]).toMatchObject({
      session_id: 'session-opp-black',
      analysis_mode: 'position',
      fen_after: AFTER_NF3_FEN,
      fen_before: null,
    })
  })

  test('board is non-interactive while computer is thinking on load', async ({ page }) => {
    const chatRequests: Array<Record<string, unknown>> = []
    let oppMoveResolve: (() => void) | null = null
    const oppMoveBlocked = new Promise<void>((resolve) => { oppMoveResolve = resolve })

    // Delay the opponent-move response so we can assert the blocked state
    await page.route('**/api/**', async (route) => {
      const url = route.request().url()
      const body = route.request().postDataJSON?.() as Record<string, unknown> | undefined

      if (url.includes('/api/validate')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { source_kind: 'fen', canonical_start_fen: STARTING_FEN, turn: 'White', legal_moves: ['e4'], pgn_metadata: null }, error: null, request_id: 'v' }) })
        return
      }
      if (url.includes('/api/session/init')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { session_id: 'session-blocked', source_kind: 'fen', initial_position: { fen: STARTING_FEN, turn: 'White', move_index: 0, source_kind: 'fen' }, timeline: { entries: [{ index: 0, fen: STARTING_FEN, turn: 'White', san: null, move_number_label: null, source: 'initial' }], current_index: 0, navigation_mode: 'timeline' }, pgn_metadata: null, session_capabilities: { opponent_mode: true } }, error: null, request_id: 's' }) })
        return
      }
      if (url.includes('/api/analyze')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFor((body?.fen as string) ?? STARTING_FEN)) })
        return
      }
      if (url.includes('/api/opponent-move')) {
        // Hold the response until we've made our assertions
        await oppMoveBlocked
        const resp = opponentMoveResponse(STARTING_FEN, AFTER_E4_FEN, 'e4', 'e2e4', 'e2', 'e4', 1)
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) })
        return
      }
      if (url.includes('/api/chat')) {
        chatRequests.push(cloneRequestBody(body))
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: chatStream('Thinking...') })
        return
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'UNKNOWN', message: 'Unknown' }, request_id: 'unknown' }) })
    })

    await page.goto('/')
    await page.getByTestId('fen-input').fill(STARTING_FEN)
    await page.getByTestId('opponent-toggle').click()
    await page.getByTestId('submit-button').click()
    await page.getByRole('button', { name: 'Black' }).click()
    await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })

    // While opponent is thinking: spinner visible, board non-interactive
    await expect(page.getByText('Opponent is thinking...')).toBeVisible()

    // Clicking a piece while waiting should do nothing (board is locked)
    await page.locator('[data-square="e7"]').click()
    await expect(page.locator('[data-square="e5"]')).not.toHaveAttribute('data-is-destination', 'true')

    // Release the opponent-move response
    oppMoveResolve!()

    // After move completes, spinner disappears
    await expect(page.getByText('Opponent is thinking...')).not.toBeVisible({ timeout: 5000 })
  })
})
