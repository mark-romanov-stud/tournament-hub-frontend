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

export const DEFAULT_TOURNAMENT_STATE = {
  id: '72293376-2d85-4f8b-a4bd-9140462f3d8a',
  title: 'Grand Invitational',
  description: 'A tournament for realtime testing.',
  visibility: 'PUBLIC',
  status: 'DRAFT',
  roundsCount: 3,
  submissionDurationSeconds: 30,
  voteDurationSeconds: 30,
  ownerId: DEFAULT_AUTH_STATE.user.id,
  participants: [
    {
      userId: DEFAULT_AUTH_STATE.user.id,
      cumulativeScore: 0,
    },
  ],
  currentRound: null,
} as const

export const DEFAULT_LIVE_TOURNAMENT_STATE = {
  hasActiveTournament: false,
  tournament: null,
} as const

export interface MockLiveTournamentState {
  hasActiveTournament: boolean
  tournament: null | {
    id: string
    title: string
    status: 'ACTIVE'
    roundId: string
    roundNumber: number
    phase: string
  }
}

export interface MockTournamentState {
  id: string
  title: string
  description: string | null
  visibility: string
  status: string
  roundsCount: number
  submissionDurationSeconds: number
  voteDurationSeconds: number
  ownerId: string
  participants: {
    userId: string
    cumulativeScore: number
  }[]
  currentRound: null | {
    id: string
    number: number
    phase: string
    prompt: {
      key: string
      type: string
      content: string
    }
    submissionDeadline: string
    submissionClosedAt: string | null
    votingDeadline: string | null
  }
}

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

let mockTournamentState: MockTournamentState = {
  ...DEFAULT_TOURNAMENT_STATE,
  participants: [...DEFAULT_TOURNAMENT_STATE.participants],
  currentRound: DEFAULT_TOURNAMENT_STATE.currentRound,
}

let mockLiveTournamentState: MockLiveTournamentState = {
  ...DEFAULT_LIVE_TOURNAMENT_STATE,
}

let fullTournamentRequestCount = 0

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
  mockTournamentState = {
    ...DEFAULT_TOURNAMENT_STATE,
    participants: [...DEFAULT_TOURNAMENT_STATE.participants],
    currentRound: DEFAULT_TOURNAMENT_STATE.currentRound,
  }
  mockLiveTournamentState = {
    ...DEFAULT_LIVE_TOURNAMENT_STATE,
  }
  fullTournamentRequestCount = 0
}

export function getMockAuthState() {
  return mockAuthState
}

export function getFullTournamentRequestCount() {
  return fullTournamentRequestCount
}

export function setMockTournamentState(tournament: MockTournamentState) {
  mockTournamentState = tournament
}

export function setMockLiveTournamentState(liveTournament: MockLiveTournamentState) {
  mockLiveTournamentState = liveTournament
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
  http.get(`${API_BASE_URL}/users/me/live-tournament`, ({ request }) => {
    const authorization = request.headers.get('authorization')

    if (authorization !== `Bearer ${mockAuthState.accessToken}`) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    return successResponse(mockLiveTournamentState)
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
  http.get(`${API_BASE_URL}/tournaments`, ({ request }) => {
    const authorization = request.headers.get('authorization')

    if (authorization !== `Bearer ${mockAuthState.accessToken}`) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    return successResponse({
      items: [
        {
          ...mockTournamentState,
          participantCount: mockTournamentState.participants.length,
        },
      ],
      totalCount: 1,
    })
  }),
  http.get(`${API_BASE_URL}/tournaments/:tournamentId/full`, ({ request }) => {
    const authorization = request.headers.get('authorization')

    if (authorization !== `Bearer ${mockAuthState.accessToken}`) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    fullTournamentRequestCount += 1

    return successResponse(mockTournamentState)
  }),
  http.get(`${API_BASE_URL}/tournaments/:tournamentId`, ({ request }) => {
    const authorization = request.headers.get('authorization')

    if (authorization !== `Bearer ${mockAuthState.accessToken}`) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    return successResponse({
      ...mockTournamentState,
      participantCount: mockTournamentState.participants.length,
    })
  }),
  http.post(`${API_BASE_URL}/tournaments/:tournamentId/start`, ({ request, params }) => {
    const authorization = request.headers.get('authorization')

    if (authorization !== `Bearer ${mockAuthState.accessToken}`) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    mockTournamentState = {
      ...mockTournamentState,
      status: 'ACTIVE',
      currentRound: {
        id: `round-${String(params.tournamentId)}`,
        number: 1,
        phase: 'SUBMISSION',
        prompt: {
          key: 'mock_start_prompt',
          type: 'TEXT',
          content: 'A tournament begins when',
        },
        submissionDeadline: new Date(Date.now() + 30_000).toISOString(),
        submissionClosedAt: null,
        votingDeadline: null,
      },
    }

    return successResponse(true)
  }),
  http.post(`${API_BASE_URL}/rounds/:roundId/submissions`, async ({ request }) => {
    const authorization = request.headers.get('authorization')

    if (authorization !== `Bearer ${mockAuthState.accessToken}`) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    const body = (await request.json()) as { content?: string }

    return successResponse({
      id: 'submission-1',
      roundId: 'round-1',
      authorId: mockAuthState.user.id,
      content: body.content ?? '',
      submittedAt: new Date().toISOString(),
    })
  }),
  http.post(`${API_BASE_URL}/rounds/:roundId/votes`, async ({ request, params }) => {
    const authorization = request.headers.get('authorization')

    if (authorization !== `Bearer ${mockAuthState.accessToken}`) {
      return errorResponse(['Unauthorized'], 401, 'Unauthorized')
    }

    const body = (await request.json()) as {
      submissionId?: string
      value?: 'LIKE' | 'DISLIKE'
    }

    return successResponse({
      id: 'vote-1',
      roundId: String(params.roundId),
      submissionId: body.submissionId ?? '',
      voterId: mockAuthState.user.id,
      value: body.value ?? 'LIKE',
      source: 'MANUAL',
      votedAt: new Date().toISOString(),
    })
  }),
]
