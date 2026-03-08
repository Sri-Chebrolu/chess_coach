import type { ApiResponse } from './types'
import type {
  ApiValidateRequest,
  ApiValidateResponse,
  ApiSessionInitRequest,
  ApiSessionInitResponse,
  ApiAnalyzeRequest,
  ApiAnalyzeResponse,
  ApiMoveRequest,
  ApiMoveResponse,
  ApiChatRequest,
  ApiChatResponse,
  ApiOpponentMoveRequest,
  ApiOpponentMoveResponse,
  ApiCoachAnalyzeMoveRequest,
} from './api-types'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(
  url: string,
  body: object,
  signal?: AbortSignal,
): Promise<ApiResponse<T>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  const json = await response.json().catch(() => ({
    ok: false,
    data: null,
    error: { code: 'PARSE_ERROR', message: 'Failed to parse server response.' },
    request_id: 'unknown',
  }))

  if (!json.ok) {
    throw new ApiError(
      json.error?.code ?? 'UNKNOWN',
      json.error?.message ?? 'An unknown error occurred.',
    )
  }

  return json
}

// ─── Typed API Wrappers ──────────────────────────────────────────────────────

export function apiValidate(body: ApiValidateRequest, signal?: AbortSignal) {
  return apiFetch<ApiValidateResponse['data']>('/api/validate', body, signal)
}

export function apiSessionInit(body: ApiSessionInitRequest, signal?: AbortSignal) {
  return apiFetch<ApiSessionInitResponse['data']>('/api/session/init', body, signal)
}

export function apiAnalyze(body: ApiAnalyzeRequest, signal?: AbortSignal) {
  return apiFetch<ApiAnalyzeResponse['data']>('/api/analyze', body, signal)
}

export function apiMove(body: ApiMoveRequest, signal?: AbortSignal) {
  return apiFetch<ApiMoveResponse['data']>('/api/move', body, signal)
}

export function apiChat(body: ApiChatRequest, signal?: AbortSignal) {
  return apiFetch<ApiChatResponse['data']>('/api/chat', body, signal)
}

export function apiOpponentMove(body: ApiOpponentMoveRequest, signal?: AbortSignal) {
  return apiFetch<ApiOpponentMoveResponse['data']>('/api/opponent-move', body, signal)
}

// ─── SSE Streaming ───────────────────────────────────────────────────────────

export interface CoachStreamCallbacks {
  onToken: (token: string) => void
  onSkip: (reason: string) => void
  onDone: () => void
  onError: (error: Error) => void
}

export async function apiStreamCoach(
  url: string,
  body: ApiCoachAnalyzeMoveRequest,
  callbacks: CoachStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok || !response.body) {
    const json = await response.json().catch(() => null)
    const msg = json?.error?.message ?? `Server error (${response.status})`
    callbacks.onError(new ApiError(json?.error?.code ?? 'UNKNOWN', msg))
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    let currentEvent = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ') && currentEvent) {
        const data = line.slice(6)
        try {
          const parsed = JSON.parse(data)
          switch (currentEvent) {
            case 'start':
              break
            case 'token':
              callbacks.onToken(parsed.token)
              break
            case 'skip':
              callbacks.onSkip(parsed.reason)
              break
            case 'error':
              callbacks.onError(new Error(parsed.message))
              break
            case 'done':
              callbacks.onDone()
              break
          }
        } catch {
          // Skip malformed JSON
        }
        currentEvent = ''
      }
    }
  }
}
