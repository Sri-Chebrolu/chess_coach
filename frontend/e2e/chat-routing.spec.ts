import { test, expect } from '@playwright/test'

const startFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const afterNc6Fen = 'r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2'
const afterE5Fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

function analysisForFen(fen: string) {
  const sideToMove = fen.includes(' w ') ? 'White' : 'Black'
  const topMove = sideToMove === 'Black'
    ? { san: 'Nc6', uci: 'b8c6', from_square: 'b8', to_square: 'c6' }
    : { san: 'Nf3', uci: 'g1f3', from_square: 'g1', to_square: 'f3' }

  return {
    ok: true,
    data: {
      position: {
        fen,
        turn: sideToMove,
        move_index: 0,
        source_kind: 'fen',
      },
      analysis: {
        top_moves: [
          {
            ...topMove,
            score_cp_white: 25,
            mate: null,
            pv: [topMove.san],
          },
        ],
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

function chatStreamResponse(text: string) {
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

async function loadFenSession(
  page: import('@playwright/test').Page,
  chatRequests: Array<Record<string, unknown>>,
) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const body = route.request().postDataJSON?.() as Record<string, unknown> | undefined

    if (url.includes('/api/validate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            source_kind: 'fen',
            canonical_start_fen: startFen,
            turn: 'Black',
            legal_moves: ['Nc6', 'Nf6', 'd5'],
            pgn_metadata: null,
          },
          error: null,
          request_id: 'validate-fen',
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
            session_id: 'session-fen',
            source_kind: 'fen',
            initial_position: {
              fen: startFen,
              turn: 'Black',
              move_index: 0,
              source_kind: 'fen',
            },
            timeline: {
              entries: [
                {
                  index: 0,
                  fen: startFen,
                  turn: 'Black',
                  san: null,
                  move_number_label: null,
                  source: 'initial',
                },
              ],
              current_index: 0,
              navigation_mode: 'timeline',
            },
            pgn_metadata: null,
            session_capabilities: { opponent_mode: true },
          },
          error: null,
          request_id: 'session-fen',
        }),
      })
      return
    }

    if (url.includes('/api/analyze')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(analysisForFen((body?.fen as string) ?? startFen)),
      })
      return
    }

    if (url.includes('/api/move')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            position_before: {
              fen: startFen,
              turn: 'Black',
              move_index: 0,
              source_kind: 'fen',
            },
            position_after: {
              fen: afterNc6Fen,
              turn: 'White',
              move_index: 1,
              source_kind: 'fen',
            },
            move_result: {
              move_san: 'Nc6',
              move_uci: 'b8c6',
              from_square: 'b8',
              to_square: 'c6',
              promotion: null,
              is_legal: true,
              is_best_move: false,
              user_move_eval_white: 10,
              best_move_eval_white: 25,
              delta_cp_white: -15,
            },
            analysis_after: analysisForFen(afterNc6Fen).data.analysis,
            timeline_update: {
              mode: 'append',
              entries: [
                {
                  index: 1,
                  fen: afterNc6Fen,
                  turn: 'White',
                  san: 'Nc6',
                  move_number_label: '1...',
                  source: 'live_play',
                },
              ],
              new_current_index: 1,
            },
          },
          error: null,
          request_id: 'move-nc6',
        }),
      })
      return
    }

    if (url.includes('/api/chat')) {
      chatRequests.push((body ?? {}) as Record<string, unknown>)
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: chatStreamResponse('How does that move change the position?'),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, data: null, error: { code: 'UNKNOWN', message: 'Unknown endpoint' }, request_id: 'unknown' }),
    })
  })

  await page.goto('/')
  await page.getByTestId('fen-input').fill(startFen)
  await page.getByTestId('submit-button').click()
  await page.getByRole('button', { name: 'Black' }).click()
  await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })
}

async function loadPgnSession(
  page: import('@playwright/test').Page,
  chatRequests: Array<Record<string, unknown>>,
) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const body = route.request().postDataJSON?.() as Record<string, unknown> | undefined

    if (url.includes('/api/validate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            source_kind: 'pgn',
            canonical_start_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            turn: 'White',
            legal_moves: ['e4', 'd4', 'Nf3'],
            pgn_metadata: {
              white: 'Student',
              black: 'Opponent',
              event: 'Regression Test',
              total_half_moves: 2,
              start_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            },
          },
          error: null,
          request_id: 'validate-pgn',
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
            session_id: 'session-pgn',
            source_kind: 'pgn',
            initial_position: {
              fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
              turn: 'White',
              move_index: 0,
              source_kind: 'pgn',
            },
            timeline: {
              entries: [
                {
                  index: 0,
                  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                  turn: 'White',
                  san: null,
                  move_number_label: null,
                  source: 'initial',
                },
                {
                  index: 1,
                  fen: startFen,
                  turn: 'Black',
                  san: 'e4',
                  move_number_label: '1.',
                  source: 'pgn_mainline',
                },
                {
                  index: 2,
                  fen: afterE5Fen,
                  turn: 'White',
                  san: 'e5',
                  move_number_label: '1...',
                  source: 'pgn_mainline',
                },
              ],
              current_index: 0,
              navigation_mode: 'timeline',
            },
            pgn_metadata: {
              white: 'Student',
              black: 'Opponent',
              event: 'Regression Test',
              total_half_moves: 2,
              start_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            },
            session_capabilities: { opponent_mode: true },
          },
          error: null,
          request_id: 'session-pgn',
        }),
      })
      return
    }

    if (url.includes('/api/analyze')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(analysisForFen((body?.fen as string) ?? startFen)),
      })
      return
    }

    if (url.includes('/api/chat')) {
      chatRequests.push((body ?? {}) as Record<string, unknown>)
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: chatStreamResponse('What did that move change?'),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, data: null, error: { code: 'UNKNOWN', message: 'Unknown endpoint' }, request_id: 'unknown' }),
    })
  })

  await page.goto('/')
  await page.getByTestId('pgn-input').fill('1. e4 e5')
  await page.getByTestId('submit-button').click()
  await page.getByRole('button', { name: 'White' }).click()
  await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })
}

test.describe('Chat routing regression', () => {
  test('submits initial position chat in position mode', async ({ page }) => {
    const chatRequests: Array<Record<string, unknown>> = []
    await loadFenSession(page, chatRequests)

    await page.getByTestId('chat-input').fill('What should I look at here?')
    await page.getByTestId('chat-send').click()

    await expect.poll(() => chatRequests.length).toBe(1)
    expect(chatRequests[0]).toMatchObject({
      session_id: 'session-fen',
      analysis_mode: 'position',
      fen_after: startFen,
      fen_before: null,
      player_color: 'black',
      side_to_move: 'black',
      message: 'What should I look at here?',
    })
  })

  test('submits follow-up chat after a live move in move comparison mode', async ({ page }) => {
    const chatRequests: Array<Record<string, unknown>> = []
    await loadFenSession(page, chatRequests)

    await page.locator('[data-square="b8"]').click()
    await page.locator('[data-square="c6"]').click()

    await expect.poll(() => chatRequests.length).toBe(1)
    expect(chatRequests[0]).toMatchObject({
      session_id: 'session-fen',
      analysis_mode: 'move_comparison',
      fen_after: afterNc6Fen,
      fen_before: startFen,
      player_color: 'black',
      side_to_move: 'white',
      message: '',
    })

    await page.getByTestId('chat-input').fill('Why is that better than d5?')
    await page.getByTestId('chat-send').click()

    await expect.poll(() => chatRequests.length).toBe(2)
    expect(chatRequests[1]).toMatchObject({
      session_id: 'session-fen',
      analysis_mode: 'move_comparison',
      fen_after: afterNc6Fen,
      fen_before: startFen,
      player_color: 'black',
      side_to_move: 'white',
      message: 'Why is that better than d5?',
    })
  })

  test('uses move comparison only for the selected side when navigating PGN history', async ({ page }) => {
    const chatRequests: Array<Record<string, unknown>> = []
    await loadPgnSession(page, chatRequests)

    await page.getByTestId('nav-next').click()
    await page.getByTestId('chat-input').fill('How good was this move?')
    await page.getByTestId('chat-send').click()

    await expect.poll(() => chatRequests.length).toBe(1)
    expect(chatRequests[0]).toMatchObject({
      session_id: 'session-pgn',
      analysis_mode: 'move_comparison',
      fen_after: startFen,
      fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      player_color: 'white',
      side_to_move: 'black',
      message: 'How good was this move?',
    })

    await page.getByTestId('nav-next').click()
    await page.getByTestId('chat-input').fill('What changed after the reply?')
    await page.getByTestId('chat-send').click()

    await expect.poll(() => chatRequests.length).toBe(2)
    expect(chatRequests[1]).toMatchObject({
      session_id: 'session-pgn',
      analysis_mode: 'position',
      fen_after: afterE5Fen,
      fen_before: null,
      player_color: 'white',
      side_to_move: 'white',
      message: 'What changed after the reply?',
    })
  })
})
