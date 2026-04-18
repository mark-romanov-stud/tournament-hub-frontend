import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderApp } from '@/app/test/render-app'
import { loadStoredSession, persistTokens } from '@/features/auth/model/token-storage'
import { DEFAULT_AUTH_STATE, getMockAuthState, resetMockAuthState } from '@/test/handlers'

describe('Authenticated routing', () => {
  beforeEach(() => {
    resetMockAuthState()
    sessionStorage.clear()
  })

  it('redirects unauthenticated users from private routes to login', async () => {
    renderApp(['/'])

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeVisible()
  })

  it('redirects authenticated users away from guest routes', async () => {
    persistTokens({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })

    renderApp(['/login'])

    expect(
      await screen.findByRole('heading', { name: /curator dashboard/i }),
    ).toBeVisible()
  })

  it('refreshes an expired access token and restores the session', async () => {
    persistTokens({
      accessToken: 'expired-access-token',
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })

    renderApp(['/'])

    expect(
      await screen.findByRole('heading', { name: /curator dashboard/i }),
    ).toBeVisible()
    expect(loadStoredSession()).toEqual({
      accessToken: getMockAuthState().accessToken,
      refreshToken: getMockAuthState().refreshToken,
    })
  })

  it('clears invalid auth state and falls back to login when refresh fails', async () => {
    persistTokens({
      accessToken: 'expired-access-token',
      refreshToken: 'bad-refresh-token',
    })

    renderApp(['/'])

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeVisible()

    await waitFor(() => {
      expect(loadStoredSession()).toBeNull()
    })
  })
})
