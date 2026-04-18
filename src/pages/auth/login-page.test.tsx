import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderApp } from '@/app/test/render-app'
import { loadStoredSession } from '@/features/auth/model/token-storage'
import { API_BASE_URL, DEFAULT_AUTH_STATE, resetMockAuthState } from '@/test/handlers'
import { server } from '@/test/server'

describe('LoginPage', () => {
  beforeEach(() => {
    resetMockAuthState()
    sessionStorage.clear()
  })

  it('submits login, stores auth, and redirects after success', async () => {
    const { user } = renderApp(['/login'])

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeVisible()

    await user.type(
      screen.getByLabelText(/email address/i),
      DEFAULT_AUTH_STATE.user.email,
    )
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.click(screen.getByRole('button', { name: /log in to dashboard/i }))

    expect(
      await screen.findByRole('heading', { name: /curator dashboard/i }),
    ).toBeVisible()
    expect(loadStoredSession()).toEqual({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })
  })

  it('shows invalid credentials correctly on login', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () => {
        return HttpResponse.json(
          {
            code: 400,
            message: ['Invalid login or password'],
            data: null,
            error: 'Bad Request',
          },
          { status: 400 },
        )
      }),
    )

    const { user } = renderApp(['/login'])

    await user.type(
      screen.getByLabelText(/email address/i),
      DEFAULT_AUTH_STATE.user.email,
    )
    await user.type(screen.getByLabelText(/^password$/i), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /log in to dashboard/i }))

    expect(await screen.findByText(/invalid login or password/i)).toBeVisible()
  })
})
