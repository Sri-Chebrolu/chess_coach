import { test, expect } from '@playwright/test'

const VALID_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

function analysisResponse(fen: string) {
  const turn = fen.includes(' w ') ? 'White' : 'Black'
  return {
    ok: true,
    data: {
      position: { fen, turn, move_index: 0, source_kind: 'fen' },
      analysis: {
        top_moves: [{ san: 'd5', uci: 'd7d5', from_square: 'd7', to_square: 'd5', score_cp_white: 20, mate: null, pv: ['d5'] }],
        heuristics: { material: { white: 39, black: 39 }, king_safety: { white: { in_check: false }, black: { in_check: false } } },
        score_semantics: { perspective: 'white', normalized_for_turn: false },
      },
    },
    error: null,
    request_id: 'analyze-test',
  }
}

/**
 * Sets up route mocks sufficient to land in the analysis view.
 * Returns a ref to captured /api/feedback request bodies.
 */
async function loadAnalysisView(
  page: import('@playwright/test').Page,
  feedbackRequests: Array<Record<string, unknown>>,
) {
  const SESSION_ID = 'session-feedback-test'

  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const body = route.request().postDataJSON?.() as Record<string, unknown> | undefined

    if (url.includes('/api/validate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { source_kind: 'fen', canonical_start_fen: VALID_FEN, turn: 'Black', legal_moves: ['d5', 'e5', 'Nf6'], pgn_metadata: null },
          error: null,
          request_id: 'validate-feedback',
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
            session_id: SESSION_ID,
            source_kind: 'fen',
            initial_position: { fen: VALID_FEN, turn: 'Black', move_index: 0, source_kind: 'fen' },
            timeline: {
              entries: [{ index: 0, fen: VALID_FEN, turn: 'Black', san: null, move_number_label: null, source: 'initial' }],
              current_index: 0,
              navigation_mode: 'timeline',
            },
            pgn_metadata: null,
            session_capabilities: { opponent_mode: false },
          },
          error: null,
          request_id: 'session-feedback',
        }),
      })
      return
    }

    if (url.includes('/api/analyze')) {
      const fen = (body?.fen as string) ?? VALID_FEN
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisResponse(fen)) })
      return
    }

    if (url.includes('/api/feedback')) {
      feedbackRequests.push(JSON.parse(JSON.stringify(body ?? {})))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { recorded: true }, error: null, request_id: 'feedback-test' }),
      })
      return
    }

    if (url.includes('/api/chat')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ['event: start', 'data: {}', '', 'event: done', 'data: {}', ''].join('\n'),
      })
      return
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'UNKNOWN', message: 'Unknown' }, request_id: 'unknown' }) })
  })

  await page.goto('/')
  await page.getByTestId('fen-input').fill(VALID_FEN)
  await page.getByTestId('submit-button').click()
  // Select White in the color modal that appears
  await page.getByRole('button', { name: /white/i }).click()
  await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Feedback button', () => {
  test('Feedback button is visible in the CoachPanel header', async ({ page }) => {
    const feedbackRequests: Array<Record<string, unknown>> = []
    await loadAnalysisView(page, feedbackRequests)

    await expect(page.getByTestId('feedback-button')).toBeVisible()
  })

  test('clicking Feedback opens the modal', async ({ page }) => {
    const feedbackRequests: Array<Record<string, unknown>> = []
    await loadAnalysisView(page, feedbackRequests)

    await page.getByTestId('feedback-button').click()

    await expect(page.getByRole('button', { name: /submit/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible()
    await expect(page.getByPlaceholder(/share your thoughts/i)).toBeVisible()
  })

  test('Submit button is disabled when textarea is empty', async ({ page }) => {
    const feedbackRequests: Array<Record<string, unknown>> = []
    await loadAnalysisView(page, feedbackRequests)

    await page.getByTestId('feedback-button').click()
    await expect(page.getByRole('button', { name: /submit/i })).toBeDisabled()
  })

  test('Cancel closes the modal without submitting', async ({ page }) => {
    const feedbackRequests: Array<Record<string, unknown>> = []
    await loadAnalysisView(page, feedbackRequests)

    await page.getByTestId('feedback-button').click()
    await page.getByPlaceholder(/share your thoughts/i).fill('Some thoughts')
    await page.getByRole('button', { name: /cancel/i }).click()

    await expect(page.getByPlaceholder(/share your thoughts/i)).not.toBeVisible()
    expect(feedbackRequests).toHaveLength(0)
  })

  test('submitting feedback calls /api/feedback with correct payload and closes modal', async ({ page }) => {
    const feedbackRequests: Array<Record<string, unknown>> = []
    await loadAnalysisView(page, feedbackRequests)

    await page.getByTestId('feedback-button').click()
    await page.getByPlaceholder(/share your thoughts/i).fill('Great coaching tool!')
    await page.getByRole('button', { name: /submit/i }).click()

    // Modal closes after submit
    await expect(page.getByPlaceholder(/share your thoughts/i)).not.toBeVisible()

    // API was called with correct body
    expect(feedbackRequests).toHaveLength(1)
    expect(feedbackRequests[0].session_id).toBe('session-feedback-test')
    expect(feedbackRequests[0].feedback_text).toBe('Great coaching tool!')
  })

  test('feedback modal can be reopened and submitted multiple times in the same session', async ({ page }) => {
    const feedbackRequests: Array<Record<string, unknown>> = []
    await loadAnalysisView(page, feedbackRequests)

    // First submission
    await page.getByTestId('feedback-button').click()
    await page.getByPlaceholder(/share your thoughts/i).fill('First piece of feedback')
    await page.getByRole('button', { name: /submit/i }).click()
    await expect(page.getByPlaceholder(/share your thoughts/i)).not.toBeVisible()

    // Second submission
    await page.getByTestId('feedback-button').click()
    await page.getByPlaceholder(/share your thoughts/i).fill('Second piece of feedback')
    await page.getByRole('button', { name: /submit/i }).click()
    await expect(page.getByPlaceholder(/share your thoughts/i)).not.toBeVisible()

    // Both requests captured with the same session_id
    expect(feedbackRequests).toHaveLength(2)
    expect(feedbackRequests[0].feedback_text).toBe('First piece of feedback')
    expect(feedbackRequests[1].feedback_text).toBe('Second piece of feedback')
    expect(feedbackRequests[0].session_id).toBe(feedbackRequests[1].session_id)
  })

  test('New Game button still works alongside Feedback button', async ({ page }) => {
    const feedbackRequests: Array<Record<string, unknown>> = []
    await loadAnalysisView(page, feedbackRequests)

    await expect(page.getByTestId('reset-button')).toBeVisible()
    await page.getByTestId('reset-button').click()
    await expect(page.getByTestId('fen-input')).toBeVisible()
  })
})
