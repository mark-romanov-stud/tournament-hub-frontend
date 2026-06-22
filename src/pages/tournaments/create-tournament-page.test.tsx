import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderApp } from '@/app/test/render-app'
import { persistTokens } from '@/features/auth/model/token-storage'
import {
  DEFAULT_AUTH_STATE,
  resetMockAuthState,
  setMockLiveTournamentState,
} from '@/test/handlers'

describe('CreateTournamentPage live tournament conflict', () => {
  beforeEach(() => {
    resetMockAuthState()
    sessionStorage.clear()
    persistTokens({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })
  })

  it('blocks tournament creation and points back to the active live match', async () => {
    setMockLiveTournamentState({
      hasActiveTournament: true,
      tournament: {
        id: 'active-tournament-id',
        title: 'Active Championship',
        status: 'ACTIVE',
        roundId: 'active-round-id',
        roundNumber: 3,
        phase: 'VOTING',
      },
    })

    renderApp(['/tournaments/create'])

    expect(
      await screen.findByRole('heading', {
        name: /initialize your competition/i,
      }),
    ).toBeVisible()
    expect(await screen.findByText(/finish your active tournament/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /create tournament/i })).toBeDisabled()
    expect(screen.getByRole('link', { name: /return to live match/i })).toHaveAttribute(
      'href',
      '/tournaments/active-tournament-id',
    )
  })
})
