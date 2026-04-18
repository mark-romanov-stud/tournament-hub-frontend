import { describe, expect, it } from 'vitest'

import {
  AUTH_ACCESS_TOKEN_STORAGE_KEY,
  AUTH_REFRESH_TOKEN_STORAGE_KEY,
  clearStoredSession,
  loadStoredSession,
  persistTokens,
} from '@/features/auth/model/token-storage'

describe('tokenStorage', () => {
  it('persists and hydrates tokens from sessionStorage', () => {
    persistTokens({
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
    })

    expect(loadStoredSession()).toEqual({
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
    })
    expect(sessionStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY)).toBe(
      'stored-access-token',
    )
    expect(sessionStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBe(
      'stored-refresh-token',
    )
  })

  it('returns null when storage is incomplete', () => {
    sessionStorage.setItem(AUTH_ACCESS_TOKEN_STORAGE_KEY, 'only-access-token')

    expect(loadStoredSession()).toBeNull()
  })

  it('clears persisted tokens', () => {
    persistTokens({
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
    })

    clearStoredSession()

    expect(loadStoredSession()).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })
})
