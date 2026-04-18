import type { AuthTokens } from '@/features/auth/model/types'

export const AUTH_ACCESS_TOKEN_STORAGE_KEY = 'tournament-hub.auth.access-token'
export const AUTH_REFRESH_TOKEN_STORAGE_KEY = 'tournament-hub.auth.refresh-token'

export function loadStoredSession(): AuthTokens | null {
  const accessToken = sessionStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY)
  const refreshToken = sessionStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)

  if (!accessToken || !refreshToken) {
    return null
  }

  return { accessToken, refreshToken }
}

export function persistTokens(tokens: AuthTokens) {
  sessionStorage.setItem(AUTH_ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken)
  sessionStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken)
}

export function clearStoredSession() {
  sessionStorage.removeItem(AUTH_ACCESS_TOKEN_STORAGE_KEY)
  sessionStorage.removeItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)
}
