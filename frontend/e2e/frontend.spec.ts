import { test, expect } from '@playwright/test'
import {
  validFen,
  validateResponse,
  analyzeResponse,
  analyzeResponseWithPgn,
  moveResponse,
  chatStreamResponse,
  pgnNavigateResponse,
  invalidFenError,
} from './fixtures'

/**
 * E2E tests for the Socratic Chess Coach frontend.
 * Uses API route interception to mock backend responses (no Stockfish/Anthropic needed).
 */

function setupApiMocks(
  page: import('@playwright/test').Page,
  overrides: Record<string, unknown> = {},
  options?: { delayMs?: number }
) {
  const mocks = {
    '/api/validate': validateResponse,
    '/api/analyze': analyzeResponse,
    '/api/move': moveResponse,
    '/api/chat': chatStreamResponse,
    ...overrides,
  }
  const delayMs = options?.delayMs ?? 0

  page.route('**/api/**', async (route) => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))

    const url = route.request().url()
    const body = route.request().postDataJSON?.()
    let response: unknown

    if (url.includes('/api/validate')) {
      response = mocks['/api/validate']
    } else if (url.includes('/api/analyze')) {
      response = body?.pgn ? analyzeResponseWithPgn : mocks['/api/analyze']
    } else if (url.includes('/api/move')) {
      response = mocks['/api/move']
    } else if (url.includes('/api/chat')) {
      response = mocks['/api/chat']
    } else if (url.includes('/api/pgn/navigate')) {
      const action = body?.action
      let moveIndex = 1
      if (action === 'next') moveIndex = 1
      else if (action === 'prev') moveIndex = 0
      else if (action === 'start') moveIndex = 0
      else if (action === 'end') moveIndex = 8
      response = pgnNavigateResponse(moveIndex)
    } else {
      response = { ok: false, error: { code: 'UNKNOWN', message: 'Unknown endpoint' } }
    }

    if (url.includes('/api/chat')) {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: String(response) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  })
}

test.describe('InputView', () => {
  test('shows FEN and PGN inputs with submit button', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    await expect(page.getByTestId('fen-input')).toBeVisible()
    await expect(page.getByTestId('pgn-input')).toBeVisible()
    await expect(page.getByTestId('submit-button')).toBeVisible()
    await expect(page.getByRole('heading', { name: /socratic chess coach/i })).toBeVisible()
  })

  test('submit button is disabled when both inputs are empty', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    const submitBtn = page.getByTestId('submit-button')
    await expect(submitBtn).toBeDisabled()
  })

  test('submit button is enabled when FEN is entered', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    await page.getByTestId('fen-input').fill(validFen)
    await expect(page.getByTestId('submit-button')).toBeEnabled()
  })

  test('submit button is enabled when PGN is entered', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    await page.getByTestId('pgn-input').fill('1. e4 e5 2. Nf3 Nc6')
    await expect(page.getByTestId('submit-button')).toBeEnabled()
  })
})

test.describe('LoadingState', () => {
  test('shows loading state when submitting valid FEN', async ({ page }) => {
    setupApiMocks(page, {}, { delayMs: 200 })
    await page.goto('/')

    await page.getByTestId('fen-input').fill(validFen)
    await page.getByTestId('submit-button').click()

    await expect(page.getByTestId('loading-state')).toBeVisible()
    await expect(page.getByTestId('loading-step')).toContainText(/validating|running|consulting/i)
    await expect(page.getByTestId('loading-cancel')).toBeVisible()
  })
})

test.describe('Error path - Invalid FEN', () => {
  test('shows error message for invalid FEN', async ({ page }) => {
    setupApiMocks(page, { '/api/validate': invalidFenError })
    await page.goto('/')

    await page.getByTestId('fen-input').fill('not a valid fen')
    await page.getByTestId('submit-button').click()

    await expect(page.getByTestId('error-message')).toBeVisible()
    await expect(page.getByTestId('error-message')).toContainText(/invalid fen/i)
    await expect(page.getByTestId('chess-board')).not.toBeVisible()
  })
})

test.describe('Happy path - FEN analysis', () => {
  test('transitions to analysis view with board, engine lines, and empty coach history', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    await page.getByTestId('fen-input').fill(validFen)
    await page.getByTestId('submit-button').click()

    await expect(page.getByTestId('loading-state')).toBeVisible()
    await expect(page.getByTestId('loading-state')).toBeHidden({ timeout: 15000 })

    await expect(page.getByTestId('chess-board')).toBeVisible()
    await expect(page.getByTestId('eval-bar')).toBeVisible()
    await expect(page.getByTestId('engine-line-0')).toBeVisible()
    await expect(page.getByTestId('engine-line-0')).toContainText('d5')
    await expect(page.getByTestId(/chat-message-\d+/)).toHaveCount(0)
  })
})

test.describe('Happy path - PGN navigation', () => {
  test('shows PGN navigator and allows navigation', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    await page.getByTestId('pgn-input').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')
    await page.getByTestId('submit-button').click()

    await expect(page.getByTestId('loading-state')).toBeHidden({ timeout: 15000 })
    await expect(page.getByTestId('pgn-navigator')).toBeVisible()
    await expect(page.getByTestId('pgn-moves')).toBeVisible()
    await expect(page.getByTestId('pgn-next')).toBeVisible()
    await expect(page.getByTestId('pgn-prev')).toBeVisible()

    await page.getByTestId('pgn-next').click()
    await expect(page.getByTestId('pgn-moves')).toContainText(/e4|e5|Nf3|Nc6/i)
  })
})

test.describe('Chat with context', () => {
  test('sends chat message and receives coach response', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    await page.getByTestId('fen-input').fill(validFen)
    await page.getByTestId('submit-button').click()
    await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })

    const initialMessageCount = await page.getByTestId(/chat-message-\d+/).count()

    await page.getByTestId('chat-input').fill('What if I had castled instead?')
    await page.getByTestId('chat-send').click()

    await expect(page.getByTestId(/chat-message-\d+/)).toHaveCount(initialMessageCount + 2, { timeout: 10000 })
    const lastMessage = page.getByTestId(/chat-message-\d+/).last()
    await expect(lastMessage).toContainText(/castling|king|safety|question|position/i)
  })
})

test.describe('Move evaluation', () => {
  test('board shows position and engine lines for move evaluation', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    await page.getByTestId('fen-input').fill(validFen)
    await page.getByTestId('submit-button').click()
    await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })

    // Verify board and move cards are ready for piece drag
    await expect(page.getByTestId('eval-bar')).toBeVisible()
    await expect(page.getByTestId('engine-line-0')).toContainText('d5')
    await expect(page.getByTestId('engine-line-1')).toContainText('e5')
    await expect(page.getByTestId('engine-line-2')).toContainText('Nf6')

    // Verify pieces are present (black knight on b8)
    const board = page.getByTestId('chess-board')
    await expect(board.locator('[data-square="b8"]')).toBeVisible()
    await expect(board.locator('[data-square="b8"] [data-piece="bN"]')).toBeVisible()
  })
})

test.describe('Reset / New Game', () => {
  test('reset button returns to input view', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    await page.getByTestId('fen-input').fill(validFen)
    await page.getByTestId('submit-button').click()
    await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })

    await page.getByTestId('reset-button').click()

    await expect(page.getByTestId('fen-input')).toBeVisible()
    await expect(page.getByTestId('chess-board')).not.toBeVisible()
  })
})

test.describe('Design / UI elements', () => {
  test('InputPanel has correct layout and styling', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    const fenInput = page.getByTestId('fen-input')
    await expect(fenInput).toHaveAttribute('placeholder', /rnbqkbnr/i)

    const pgnInput = page.getByTestId('pgn-input')
    await expect(pgnInput).toBeVisible()
  })

  test('AnalysisLayout shows two-panel grid', async ({ page }) => {
    setupApiMocks(page)
    await page.goto('/')

    await page.getByTestId('fen-input').fill(validFen)
    await page.getByTestId('submit-button').click()
    await expect(page.getByTestId('chess-board')).toBeVisible({ timeout: 15000 })

    await expect(page.getByTestId('chat-history')).toBeVisible()
    await expect(page.getByTestId('chat-input')).toBeVisible()
  })
})
