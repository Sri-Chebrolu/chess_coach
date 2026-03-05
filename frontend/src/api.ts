import type { ApiResponse } from './types'

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

export interface SSECallbacks<T> {
  onMoveData: (data: T) => void
  onCoachToken: (token: string) => void
  onCoachSkip: (reason: string) => void
  onDone: () => void
  onError: (error: Error) => void
}

/**
 * Consume an SSE stream from /api/move.
 * Events: move_data, coach_stream, coach_skip, coach_error, done
 */
export async function apiStreamMove<T>(
  url: string,
  body: object,
  callbacks: SSECallbacks<T>,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok || !response.body) {
    // Non-SSE error response (e.g. 400/404) — try to parse as JSON
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
            case 'move_data':
              callbacks.onMoveData(parsed)
              break
            case 'coach_stream':
              callbacks.onCoachToken(parsed.token)
              break
            case 'coach_skip':
              callbacks.onCoachSkip(parsed.reason)
              break
            case 'coach_error':
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
