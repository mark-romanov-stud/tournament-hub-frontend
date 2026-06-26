import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderApp } from '@/app/test/render-app'
import { loadStoredSession, persistTokens } from '@/features/auth/model/token-storage'
import {
  DEFAULT_AUTH_STATE,
  DEFAULT_TOURNAMENT_STATE,
  getMockAuthState,
  resetMockAuthState,
  setMockLiveTournamentState,
} from '@/test/handlers'

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

  it('shows an app-level recovery action for the active tournament', async () => {
    const liveTournament = {
      id: DEFAULT_TOURNAMENT_STATE.id,
      title: 'Live Recovery Match',
      status: 'ACTIVE' as const,
      roundId: 'round-live-1',
      roundNumber: 2,
      phase: 'VOTING',
    }

    setMockLiveTournamentState({
      hasActiveTournament: true,
      tournament: liveTournament,
    })
    persistTokens({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })

    const { router, user } = renderApp(['/'])

    expect(await screen.findByTestId('live-tournament-recovery')).toHaveTextContent(
      'Live Recovery Match',
    )
    expect(screen.getByTestId('live-tournament-recovery')).toHaveTextContent(
      'Round 2 · Voting',
    )

    await user.click(screen.getByRole('button', { name: /return to live match/i }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/tournaments/${liveTournament.id}`)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('live-tournament-recovery')).not.toBeInTheDocument()
    })
  })

  it('does not show recovery UI when the user has no active tournament', async () => {
    persistTokens({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })

    renderApp(['/'])

    expect(
      await screen.findByRole('heading', { name: /curator dashboard/i }),
    ).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByTestId('live-tournament-recovery')).not.toBeInTheDocument()
    })
  })

  it('opens a public tournament from the dashboard join code modal', async () => {
    persistTokens({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })

    const { router, user } = renderApp(['/'])

    expect(
      await screen.findByRole('heading', { name: /curator dashboard/i }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: /join by code/i }))
    expect(screen.getByRole('dialog', { name: /join by code/i })).toBeVisible()

    await user.type(
      screen.getByLabelText(/room code or invite link/i),
      DEFAULT_TOURNAMENT_STATE.id,
    )
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`,
      )
      expect(router.state.location.search).toBe('')
    })
  })

  it('preserves private invite tokens from the dashboard join code modal', async () => {
    const inviteToken = '11111111-2222-4333-8444-555555555555'

    persistTokens({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })

    const { router, user } = renderApp(['/'])

    expect(
      await screen.findByRole('heading', { name: /curator dashboard/i }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: /join by code/i }))
    await user.type(
      screen.getByLabelText(/room code or invite link/i),
      `${window.location.origin}/tournaments/${DEFAULT_TOURNAMENT_STATE.id}?inviteToken=${inviteToken}`,
    )
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`,
      )
      expect(router.state.location.search).toBe(`?inviteToken=${inviteToken}`)
    })
  })

  it('shows an inline error for an invalid dashboard room code', async () => {
    persistTokens({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })

    const { router, user } = renderApp(['/'])

    expect(
      await screen.findByRole('heading', { name: /curator dashboard/i }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: /join by code/i }))
    await user.type(screen.getByLabelText(/room code or invite link/i), 'not-a-room')
    await user.click(screen.getByRole('button', { name: /^join$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a tournament link/i)
    expect(router.state.location.pathname).toBe('/')
  })
})
