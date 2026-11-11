// Telling "the server said no" apart from "the server couldn't be reached".
//
// Poor internet must never look like a dead session: only a real answer from
// the server may log someone out. Everything here is pure, for tests.

// Gateways and load balancers answer these when the API itself is down.
const GATEWAY_DOWN = new Set([502, 503, 504])
const NETWORK_CODES = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'])

// An axios (or fetch) failure that means the server wasn't reached, so the
// request may or may not have arrived: no response, a timeout, or a gateway error.
export const isUnreachableError = (err: unknown): boolean => {
  const e = err as { code?: string; response?: { status?: number }; request?: unknown; isAxiosError?: boolean; name?: string } | null
  if (!e || typeof e !== 'object') return false
  if (e.response?.status) return GATEWAY_DOWN.has(e.response.status)
  // Cancelled on purpose (left the page, new search): not a network problem.
  if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError') return false
  if (e.code && NETWORK_CODES.has(e.code)) return true
  // fetch(): "TypeError: Failed to fetch" / an aborted (timed-out) request.
  if (e.name === 'TypeError' || e.name === 'AbortError' || e.name === 'TimeoutError') return true
  return !!e.isAxiosError && !!e.request
}

export type RefreshOutcome = 'ok' | 'rejected' | 'unreachable'

// The token refresh endpoint's answer. `null` = no answer at all (offline,
// timeout). The account service answers an invalid or expired refresh token
// with 500 (BACKEND_REQUIREMENTS §13.5 asks for 401), so a plain 500 still
// counts as rejected; only gateway errors mean "try again later".
export const refreshOutcome = (status: number | null): RefreshOutcome =>
  status === null || GATEWAY_DOWN.has(status) ? 'unreachable' : status >= 200 && status < 300 ? 'ok' : 'rejected'

// Requests slower than this make the connection count as slow.
export const SLOW_MS = 4000
