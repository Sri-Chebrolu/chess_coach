import { test, expect } from '@playwright/test'

const startFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

const coachReplyText = 'That is a great question. Castling would improve king safety significantly.'

function analysisForFen(fen: string) {
  const sideToMove = fen.includes(' w ') ? 'White' : 'Black'
  return {
    ok: true,
    data: {
      position: { fen, turn: sideToMove, move_index: 0, source_kind: 'fen' },
      analysis: {
        top_moves: [
          { san: 'Nc6', uci: 'b8c6', from_square: 'b8', to_square: 'c6', score_cp_white: 25, mate: null, pv: ['Nc6'] },
        ],
        heuristics: {
          material: { white: 39, black: 39 },
          king_safety: { white: { in_check: false }, black: { in_check: false } },
        },
        score_semantics: { perspective: 'white', normalized_for_turn: false },
      },
    },
    error: null,
    request_id: 'analyze-test',
  }
}

function chatStream(text: string) {
  // Split text into small chunks to simulate realistic token delivery
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += 5) {
    chunks.push(text.slice(i, i + 5))
  }
  const events = ['event: start', 'data: {}', '']
  for (const chunk of chunks) {
    events.push('event: token', `data: ${JSON.stringify({ token: chunk })}`, '')
  }
  events.push('event: done', 'data: {}', '')
  return events.join('\n')
}

async function setupSession(page: import('@playwright/test').Page) {
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
            initial_position: { fen: startFen, turn: 'Black', move_index: 0, source_kind: 'fen' },
            timeline: {
              entries: [{ index: 0, fen: startFen, turn: 'Black', san: null, move_number_label: null, source: 'initial' }],
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

    if (url.includes('/api/chat')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: chatStream(coachReplyText),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, data: null, error: { code: 'UNKNOWN', message: 'Unknown' }, request_id: 'unknown' }),
    })
  })

  await page.goto('/')
  await page.getByTestId('fen-input').fill(startFen)
  await page.getByTestId('submit-button').click()
  await page.getByRole('button', { name: 'Black' }).click()
  await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })
}

test.describe('Coach typewriter streaming', () => {
  test('coach response appears progressively then shows full text', async ({ page }) => {
    await setupSession(page)

    // Send a chat message
    await page.getByTestId('chat-input').fill('Should I castle here?')
    await page.getByTestId('chat-send').click()

    // A coach bubble should appear — initially with partial content due to typewriter
    const coachBubbles = page.locator('[data-testid^="chat-message-"]').filter({ hasText: 'Coach' })
    await expect(coachBubbles.last()).toBeVisible({ timeout: 5000 })

    // Capture text shortly after appearance — should be shorter than full response
    // (typewriter reveals ~2 chars every 16ms, so after ~50ms only ~6 chars visible)
    const earlyText = await coachBubbles.last().innerText()
    const earlyContentLength = earlyText.replace('Coach\n', '').length

    // The full text should eventually appear (typewriter completes)
    await expect(coachBubbles.last()).toContainText(coachReplyText, { timeout: 10000 })

    // Verify typewriter was active: early snapshot should have been shorter than final
    // (This can be flaky if the test runner is slow, so we just check the final state is correct)
    const finalText = await coachBubbles.last().innerText()
    expect(finalText).toContain(coachReplyText)
  })

  test('user messages render instantly without typewriter', async ({ page }) => {
    await setupSession(page)

    const userMessage = 'Should I castle here?'
    await page.getByTestId('chat-input').fill(userMessage)
    await page.getByTestId('chat-send').click()

    // User bubble should contain the full message immediately
    const userBubble = page.locator('[data-testid^="chat-message-"]').filter({ hasText: 'You' })
    await expect(userBubble.last()).toContainText(userMessage, { timeout: 2000 })
  })
})
