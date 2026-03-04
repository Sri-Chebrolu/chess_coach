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
