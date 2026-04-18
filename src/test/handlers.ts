import { http, HttpResponse } from 'msw'

export const API_BASE_URL = '*/api/v1'

export const DEFAULT_AUTH_STATE = {
  user: {
    id: '2ed3cf87-3f6f-4f88-8fd3-3f0f410fb410',
    email: 'curator@pulse.com',
    username: 'curator_john',
  },
  accessToken: 'access-token-1',
  refreshToken: 'refresh-token-1',
} as const

interface MockAuthState {
  user: {
    id: string
    email: string
    username: string
  }
  accessToken: string
  refreshToken: string
}

let mockAuthState: MockAuthState = {
  ...DEFAULT_AUTH_STATE,
  user: { ...DEFAULT_AUTH_STATE.user },
}

function successResponse<T>(data: T, status = 200) {
  return HttpResponse.json(
    {
      code: status,
      message: ['success'],
      data,
      error: null,
    },
    { status },
  )
}

function errorResponse(messages: string[], status: number, error: string) {
  return HttpResponse.json(
    {
      code: status,
      message: messages,
      data: null,
      error,
    },
    { status },
  )
}

export function resetMockAuthState() {
  mockAuthState = {
    ...DEFAULT_AUTH_STATE,
    user: { ...DEFAULT_AUTH_STATE.user },
  }
}

export function getMockAuthState() {
  return mockAuthState
}

export const handlers = [
  http.post(`${API_BASE_URL}/auth/register`, () => {
    return successResponse(
      {
        accessToken: mockAuthState.accessToken,
        refreshToken: mockAuthState.refreshToken,
      },
      201,
    )
  }),
  http.post(`${API_BASE_URL}/auth/login`, () => {
    return successResponse(
      {
        accessToken: mockAuthState.accessToken,
        refreshToken: mockAuthState.refreshToken,
      },
      201,
    )
  }),
  http.get(`${API_BASE_URL}/users/profile`, ({ request }) => {
    const authorization = request.headers.get('authorization')

    if (authorization !== `Bearer ${mockAuthState.accessToken}`) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    return successResponse(mockAuthState.user)
  }),
  http.post(`${API_BASE_URL}/auth/refresh`, async ({ request }) => {
    const authorization = request.headers.get('authorization')
    const body = (await request.json()) as { refreshToken?: string }

    if (
      authorization !== `Bearer ${mockAuthState.refreshToken}` ||
      body.refreshToken !== mockAuthState.refreshToken
    ) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    mockAuthState = {
      ...mockAuthState,
      accessToken: 'refreshed-access-token',
      refreshToken: 'refreshed-refresh-token',
    }

    return successResponse(
      {
        accessToken: mockAuthState.accessToken,
        refreshToken: mockAuthState.refreshToken,
      },
      201,
    )
  }),
  http.delete(`${API_BASE_URL}/auth/logout`, ({ request }) => {
    const authorization = request.headers.get('authorization')

    if (!authorization?.startsWith('Bearer ')) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    return successResponse(true)
  }),
]
