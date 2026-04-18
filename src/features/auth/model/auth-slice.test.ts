import { describe, expect, it } from 'vitest'

import {
  authActions,
  authReducer,
  initialAuthState,
} from '@/features/auth/model/auth-slice'

describe('authSlice', () => {
  it('tracks bootstrap transitions', () => {
    const loadingState = authReducer(initialAuthState, authActions.bootstrapStarted())
    const readyState = authReducer(loadingState, authActions.bootstrapFinished())

    expect(loadingState.bootstrapStatus).toBe('loading')
    expect(readyState.bootstrapStatus).toBe('ready')
  })

  it('stores tokens and user data', () => {
    const withTokens = authReducer(
      initialAuthState,
      authActions.tokensReceived({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    )
    const withUser = authReducer(
      withTokens,
      authActions.userReceived({
        id: 'user-1',
        email: 'curator@pulse.com',
        username: 'curator',
      }),
    )

    expect(withUser.tokens).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    expect(withUser.user).toEqual({
      id: 'user-1',
      email: 'curator@pulse.com',
      username: 'curator',
    })
  })

  it('clears the session state', () => {
    const authenticatedState = {
      bootstrapStatus: 'ready' as const,
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
      user: {
        id: 'user-1',
        email: 'curator@pulse.com',
        username: 'curator',
      },
    }

    const clearedState = authReducer(authenticatedState, authActions.sessionCleared())

    expect(clearedState).toEqual({
      bootstrapStatus: 'ready',
      tokens: null,
      user: null,
    })
  })
})
