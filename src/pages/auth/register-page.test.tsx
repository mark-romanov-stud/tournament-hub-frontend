import { screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderApp } from '@/app/test/render-app'
import { loadStoredSession } from '@/features/auth/model/token-storage'
import { API_BASE_URL, DEFAULT_AUTH_STATE, resetMockAuthState } from '@/test/handlers'
import { server } from '@/test/server'

describe('RegisterPage', () => {
  beforeEach(() => {
    resetMockAuthState()
    sessionStorage.clear()
  })

  it('renders registration fields and validates them before submit', async () => {
    const { user } = renderApp(['/register'])

    expect(await screen.findByRole('heading', { name: /create account/i })).toBeVisible()
    expect(screen.getByLabelText(/email address/i)).toBeVisible()
    expect(screen.getByLabelText(/username/i)).toBeVisible()
    expect(screen.getByLabelText(/^password$/i)).toBeVisible()

    await user.click(screen.getByRole('button', { name: /register account/i }))

    expect(screen.getByText(/email is required/i)).toBeVisible()
    expect(screen.getByText(/username is required/i)).toBeVisible()
    expect(screen.getByText(/password is required/i)).toBeVisible()

    await user.type(screen.getByLabelText(/email address/i), 'bad-email')
    await user.type(screen.getByLabelText(/username/i), 'ab')
    await user.type(screen.getByLabelText(/^password$/i), '12345')
    await user.click(screen.getByRole('button', { name: /register account/i }))

    expect(screen.getByText(/enter a valid email address/i)).toBeVisible()
    expect(screen.getByText(/username must be 3 to 14 characters/i)).toBeVisible()
    expect(screen.getByText(/password must be at least 6 characters/i)).toBeVisible()
  })

  it('shows registration loading, persists auth, and redirects on success', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/register`, async () => {
        await delay(150)

        return HttpResponse.json(
          {
            code: 201,
            message: ['success'],
            data: {
              accessToken: DEFAULT_AUTH_STATE.accessToken,
              refreshToken: DEFAULT_AUTH_STATE.refreshToken,
            },
            error: null,
          },
          { status: 201 },
        )
      }),
    )

    const { user } = renderApp(['/register'])

    await user.type(
      screen.getByLabelText(/email address/i),
      DEFAULT_AUTH_STATE.user.email,
    )
    await user.type(screen.getByLabelText(/username/i), DEFAULT_AUTH_STATE.user.username)
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.click(screen.getByRole('button', { name: /register account/i }))

    expect(
      await screen.findByRole('button', { name: /creating account/i }),
    ).toBeDisabled()
    expect(
      await screen.findByRole('heading', { name: /curator dashboard/i }),
    ).toBeVisible()
    expect(loadStoredSession()).toEqual({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })
  })

  it('shows backend registration errors to the user', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/register`, () => {
        return HttpResponse.json(
          {
            code: 400,
            message: ['Username is already taken'],
            data: null,
            error: 'Bad Request',
          },
          { status: 400 },
        )
      }),
    )

    const { user } = renderApp(['/register'])

    await user.type(
      screen.getByLabelText(/email address/i),
      DEFAULT_AUTH_STATE.user.email,
    )
    await user.type(screen.getByLabelText(/username/i), DEFAULT_AUTH_STATE.user.username)
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.click(screen.getByRole('button', { name: /register account/i }))

    expect(await screen.findByText(/username is already taken/i)).toBeVisible()
  })
})
