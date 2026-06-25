import { act, screen, waitFor } from '@testing-library/react'
import { io } from 'socket.io-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderApp } from '@/app/test/render-app'
import { persistTokens } from '@/features/auth/model/token-storage'
import {
  DEFAULT_AUTH_STATE,
  DEFAULT_TOURNAMENT_STATE,
  getFullTournamentRequestCount,
  resetMockAuthState,
  setMockLiveTournamentState,
  setMockTournamentState,
} from '@/test/handlers'

type Listener = (...args: unknown[]) => void
type AuthCallback = (payload: object) => void
type SocketAuth = (callback: AuthCallback) => void

class FakeEmitter {
  handlers = new Map<string, Listener[]>()

  on(eventName: string, listener: Listener) {
    const listeners = this.handlers.get(eventName) ?? []
    listeners.push(listener)
    this.handlers.set(eventName, listeners)
    return this
  }

  off(eventName: string, listener?: Listener) {
    if (!listener) {
      this.handlers.delete(eventName)
      return this
    }

    this.handlers.set(
      eventName,
      (this.handlers.get(eventName) ?? []).filter(
        (registeredListener) => registeredListener !== listener,
      ),
    )
    return this
  }

  trigger(eventName: string, payload?: unknown) {
    for (const listener of this.handlers.get(eventName) ?? []) {
      listener(payload)
    }
  }

  listenerCount() {
    return Array.from(this.handlers.values()).reduce(
      (count, listeners) => count + listeners.length,
      0,
    )
  }
}

class FakeSocket extends FakeEmitter {
  io = new FakeEmitter()
  emitted: { eventName: string; payload: unknown }[] = []
  disconnectCount = 0

  emit(eventName: string, payload: unknown) {
    this.emitted.push({ eventName, payload })
    return this
  }

  connect() {
    this.trigger('connect')
    return this
  }

  disconnect() {
    this.disconnectCount += 1
    return this
  }

  totalListenerCount() {
    return this.listenerCount() + this.io.listenerCount()
  }
}

const fakeSocket = new FakeSocket()
const mockedIo = vi.mocked(io)

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}))

describe('TournamentPage realtime flow', () => {
  beforeEach(() => {
    resetMockAuthState()
    sessionStorage.clear()
    fakeSocket.handlers.clear()
    fakeSocket.io.handlers.clear()
    fakeSocket.emitted = []
    fakeSocket.disconnectCount = 0
    mockedIo.mockClear()
    persistTokens({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })
  })

  it('joins the tournament room, receives events, recovers after reconnect, and leaves on exit', async () => {
    const { unmount } = renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])

    expect(
      await screen.findByRole('heading', { name: /tournament created/i }),
    ).toBeVisible()
    await waitFor(() => {
      expect(screen.getByTestId('tournament-realtime-status')).toHaveTextContent(
        'Connected',
      )
    })
    expect(
      screen.getByTestId(`participant-${DEFAULT_AUTH_STATE.user.id}`),
    ).toHaveTextContent(`${DEFAULT_AUTH_STATE.user.username} · You`)
    expect(fakeSocket.emitted).toContainEqual({
      eventName: 'tournament:join',
      payload: { tournamentId: DEFAULT_TOURNAMENT_STATE.id },
    })
    const socketOptions = mockedIo.mock.calls.at(0)?.[1]
    const authPayload = await new Promise<unknown>((resolve) => {
      const auth = socketOptions?.auth as SocketAuth | undefined

      auth?.((payload: object) => {
        resolve(payload)
      })
    })
    expect(authPayload).toEqual({ token: DEFAULT_AUTH_STATE.accessToken })
    expect(getFullTournamentRequestCount()).toBe(1)

    act(() => {
      fakeSocket.trigger('tournament:started', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
      })
    })
    expect(screen.queryByTestId('tournament-latest-event')).not.toBeInTheDocument()

    act(() => {
      fakeSocket.trigger('disconnect')
    })
    expect(screen.getByTestId('tournament-realtime-status')).toHaveTextContent(
      'Disconnected',
    )

    act(() => {
      fakeSocket.trigger('connect')
    })

    await waitFor(() => {
      expect(getFullTournamentRequestCount()).toBe(2)
    })
    expect(screen.queryByTestId('tournament-recovery-note')).not.toBeInTheDocument()

    unmount()

    expect(fakeSocket.emitted).toContainEqual({
      eventName: 'tournament:leave',
      payload: { tournamentId: DEFAULT_TOURNAMENT_STATE.id },
    })
    expect(fakeSocket.disconnectCount).toBe(1)
    expect(fakeSocket.totalListenerCount()).toBe(0)
  })

  it('shows submission prompt, countdown, progress, and hides participant submissions until voting starts', async () => {
    const submissionDeadline = new Date(Date.now() + 30_000).toISOString()

    setMockTournamentState({
      ...DEFAULT_TOURNAMENT_STATE,
      status: 'ACTIVE',
      participants: [
        ...DEFAULT_TOURNAMENT_STATE.participants,
        { userId: 'participant-2', cumulativeScore: 0 },
        { userId: 'participant-3', cumulativeScore: 0 },
        { userId: 'participant-4', cumulativeScore: 0 },
      ],
      currentRound: {
        id: '18d6ff5b-cc66-4cb8-8728-6e3d2f59f0d5',
        number: 1,
        phase: 'SUBMISSION',
        prompt: {
          key: 'alien_impress',
          type: 'TEXT',
          content: 'The best way to impress an alien visiting Earth.',
        },
        submissionDeadline,
        submissionClosedAt: null,
        votingDeadline: null,
      },
    })

    const { user } = renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])

    expect(
      await screen.findByRole('heading', { name: /round 1 submission/i }),
    ).toBeVisible()
    expect(
      screen.getByText('The best way to impress an alien visiting Earth.'),
    ).toBeVisible()
    expect(screen.getByTestId('submission-countdown')).toHaveTextContent(
      /seconds remaining/i,
    )
    expect(screen.getByTestId('submission-progress')).toHaveTextContent(
      '0 of 4 submitted',
    )
    expect(screen.getByText(/submissions are hidden until voting starts/i)).toBeVisible()

    await user.type(
      screen.getByLabelText(/continue the phrase/i),
      'A sincere tour through human music.',
    )
    await user.click(screen.getByRole('button', { name: /submit response/i }))

    expect(await screen.findByText(/submission saved/i)).toBeVisible()
    expect(screen.queryByText('A rival participant answer')).not.toBeInTheDocument()

    act(() => {
      fakeSocket.trigger('round:progress_updated', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId: '18d6ff5b-cc66-4cb8-8728-6e3d2f59f0d5',
        phase: 'SUBMISSION',
        submittedCount: 2,
        totalActiveParticipants: 4,
        content: 'A rival participant answer',
        occurredAt: new Date().toISOString(),
      })
    })

    expect(screen.getByTestId('submission-progress')).toHaveTextContent(
      '2 of 4 submitted',
    )
    expect(screen.queryByText('A rival participant answer')).not.toBeInTheDocument()

    act(() => {
      fakeSocket.trigger('round:phase_changed', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId: '18d6ff5b-cc66-4cb8-8728-6e3d2f59f0d5',
        roundNumber: 1,
        previousPhase: 'SUBMISSION',
        currentPhase: 'VOTING',
        occurredAt: new Date().toISOString(),
      })
    })

    expect(await screen.findByRole('heading', { name: /round 1 voting/i })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /submit response/i }),
    ).not.toBeInTheDocument()
  })

  it('enables the owner start action at four participants and opens round one', async () => {
    setMockTournamentState({
      ...DEFAULT_TOURNAMENT_STATE,
      participants: [
        ...DEFAULT_TOURNAMENT_STATE.participants,
        { userId: 'participant-2', cumulativeScore: 0 },
        { userId: 'participant-3', cumulativeScore: 0 },
        { userId: 'participant-4', cumulativeScore: 0 },
      ],
      currentRound: null,
    })

    const { user } = renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])
    const startButton = await screen.findByRole('button', {
      name: /start tournament/i,
    })

    expect(screen.getByText(/all required players are here/i)).toBeVisible()
    expect(startButton).toBeEnabled()

    await user.click(startButton)

    expect(
      await screen.findByRole('heading', { name: /round 1 submission/i }),
    ).toBeVisible()
    expect(screen.getByTestId('active-round-prompt')).toHaveTextContent(
      'A tournament begins when',
    )
    expect(
      screen.queryByRole('button', { name: /start tournament/i }),
    ).not.toBeInTheDocument()
  })

  it('replaces the prompt and clears the submission form when the active round changes', async () => {
    const firstRoundId = '18d6ff5b-cc66-4cb8-8728-6e3d2f59f0d5'
    const secondRoundId = '3f8c87b0-28a4-4e83-bc57-1b22e17f5d2a'
    const firstPrompt = 'The best way to impress an alien visiting Earth.'
    const secondPrompt = 'The least useful superpower at a job interview.'

    setMockTournamentState({
      ...DEFAULT_TOURNAMENT_STATE,
      status: 'ACTIVE',
      participants: [...DEFAULT_TOURNAMENT_STATE.participants],
      currentRound: {
        id: firstRoundId,
        number: 1,
        phase: 'SUBMISSION',
        prompt: {
          key: 'alien_impress',
          type: 'TEXT',
          content: firstPrompt,
        },
        submissionDeadline: new Date(Date.now() + 30_000).toISOString(),
        submissionClosedAt: null,
        votingDeadline: null,
      },
    })

    const { user } = renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])
    const submission = await screen.findByLabelText(/continue the phrase/i)

    expect(screen.getByTestId('active-round-prompt')).toHaveTextContent(firstPrompt)
    expect(screen.getByTestId('round-submission-form')).toHaveAttribute(
      'data-round-id',
      firstRoundId,
    )

    await user.type(submission, 'A draft for the first round.')
    expect(submission).toHaveValue('A draft for the first round.')

    act(() => {
      fakeSocket.trigger('round:created', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId: secondRoundId,
        roundNumber: 2,
        phase: 'SUBMISSION',
        prompt: {
          key: 'unexpected_superpower',
          type: 'TEXT',
          content: secondPrompt,
        },
        submissionDeadline: new Date(Date.now() + 30_000).toISOString(),
        occurredAt: new Date().toISOString(),
      })
    })

    expect(
      await screen.findByRole('heading', { name: /round 2 submission/i }),
    ).toBeVisible()
    expect(screen.getByTestId('active-round-prompt')).toHaveTextContent(secondPrompt)
    expect(screen.queryByText(firstPrompt)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/continue the phrase/i)).toHaveValue('')
    expect(screen.getByTestId('round-submission-form')).toHaveAttribute(
      'data-round-id',
      secondRoundId,
    )
  })

  it('updates draft participants and counts from realtime join and leave events', async () => {
    renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])

    expect(
      await screen.findByTestId(`participant-${DEFAULT_AUTH_STATE.user.id}`),
    ).toHaveTextContent(`${DEFAULT_AUTH_STATE.user.username} · You`)
    expect(
      screen.getByText((_content, element) => {
        return element?.textContent === 'Participant count: 1'
      }),
    ).toBeVisible()

    act(() => {
      fakeSocket.trigger('tournament:participant_joined', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        userId: 'participant-2',
        username: 'participant_two',
        occurredAt: new Date().toISOString(),
      })
    })

    expect(await screen.findByText('participant_two')).toBeVisible()
    expect(
      screen.getByText((_content, element) => {
        return element?.textContent === 'Participant count: 2'
      }),
    ).toBeVisible()

    act(() => {
      fakeSocket.trigger('tournament:presence_updated', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        activeCount: 2,
        occurredAt: new Date().toISOString(),
      })
    })

    expect(
      screen.getByText((_content, element) => {
        return element?.textContent === 'Active users: 2'
      }),
    ).toBeVisible()

    act(() => {
      fakeSocket.trigger('tournament:participant_left', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        userId: 'participant-2',
        occurredAt: new Date().toISOString(),
      })
    })

    expect(screen.queryByText('participant-2')).not.toBeInTheDocument()
    expect(
      screen.getByText((_content, element) => {
        return element?.textContent === 'Participant count: 1'
      }),
    ).toBeVisible()
  })

  it('shows one revealed submission, saves a vote, advances sequentially, and blocks self-voting', async () => {
    const roundId = '18d6ff5b-cc66-4cb8-8728-6e3d2f59f0d5'
    const firstSubmissionId = '8f2c604f-0adc-418a-93f1-67e3c74be770'
    const secondSubmissionId = '1a676334-577e-40ee-a8ea-a468598fbdef'

    setMockTournamentState({
      ...DEFAULT_TOURNAMENT_STATE,
      status: 'ACTIVE',
      participants: [
        ...DEFAULT_TOURNAMENT_STATE.participants,
        { userId: 'participant-2', cumulativeScore: 0 },
      ],
      currentRound: {
        id: roundId,
        number: 1,
        phase: 'SUBMISSION',
        prompt: {
          key: 'alien_impress',
          type: 'TEXT',
          content: 'The best way to impress an alien visiting Earth.',
        },
        submissionDeadline: new Date(Date.now() - 1_000).toISOString(),
        submissionClosedAt: new Date().toISOString(),
        votingDeadline: null,
      },
    })

    const { user } = renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])

    expect(
      await screen.findByRole('heading', { name: /round 1 submission/i }),
    ).toBeVisible()

    act(() => {
      fakeSocket.trigger('voting:submission_revealed', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId,
        submission: {
          id: firstSubmissionId,
          authorId: 'participant-2',
          content: 'First revealed answer',
          submittedAt: new Date().toISOString(),
        },
        revealIndex: 0,
        totalSubmissions: 2,
        votingDeadline: new Date(Date.now() + 30_000).toISOString(),
        occurredAt: new Date().toISOString(),
      })
    })

    expect(await screen.findByText('First revealed answer')).toBeVisible()
    expect(screen.getByText('Submission 1 of 2')).toBeVisible()
    expect(screen.getByTestId('voting-countdown')).toHaveTextContent(/seconds remaining/i)
    expect(screen.queryByText('Second revealed answer')).not.toBeInTheDocument()

    act(() => {
      fakeSocket.trigger('vote:progress_updated', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId,
        submissionId: firstSubmissionId,
        votedCount: 1,
        totalEligibleActiveVoters: 2,
        occurredAt: new Date().toISOString(),
      })
    })

    expect(screen.getByTestId('vote-progress')).toHaveTextContent(
      '1 of 2 active voters responded',
    )
    await user.click(screen.getByRole('button', { name: /^like$/i }))
    expect(await screen.findByText(/your like was saved/i)).toBeVisible()

    act(() => {
      fakeSocket.trigger('vote:finalized', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId,
        submissionId: firstSubmissionId,
        likeCount: 1,
        dislikeCount: 1,
        occurredAt: new Date().toISOString(),
      })
    })

    expect(screen.getByTestId('vote-finalized-result')).toHaveTextContent(
      '1 likes and 1 dislikes',
    )

    act(() => {
      fakeSocket.trigger('voting:submission_revealed', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId,
        submission: {
          id: secondSubmissionId,
          authorId: DEFAULT_AUTH_STATE.user.id,
          content: 'Second revealed answer',
          submittedAt: new Date().toISOString(),
        },
        revealIndex: 1,
        totalSubmissions: 2,
        votingDeadline: new Date(Date.now() + 30_000).toISOString(),
        occurredAt: new Date().toISOString(),
      })
    })

    expect(await screen.findByText('Second revealed answer')).toBeVisible()
    expect(screen.queryByText('First revealed answer')).not.toBeInTheDocument()
    expect(screen.getByText('Submission 2 of 2')).toBeVisible()
    expect(screen.getByText(/self-voting is disabled/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /^like$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^dislike$/i })).toBeDisabled()

    act(() => {
      fakeSocket.trigger('round:completed', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId,
        occurredAt: new Date().toISOString(),
      })
    })

    expect(
      await screen.findByRole('heading', { name: /round 1 voting finished/i }),
    ).toBeVisible()
    expect(screen.queryByText('Second revealed answer')).not.toBeInTheDocument()
  })

  it('shows round rankings, updates cumulative standings, and switches to the next round from realtime events', async () => {
    const roundId = '18d6ff5b-cc66-4cb8-8728-6e3d2f59f0d5'
    const nextRoundId = '3f8c87b0-28a4-4e83-bc57-1b22e17f5d2a'
    const participantId = 'participant-2'

    setMockTournamentState({
      ...DEFAULT_TOURNAMENT_STATE,
      status: 'ACTIVE',
      participants: [
        ...DEFAULT_TOURNAMENT_STATE.participants,
        { userId: participantId, username: 'participant_two', cumulativeScore: 0 },
      ],
      currentRound: {
        id: roundId,
        number: 1,
        phase: 'VOTING',
        prompt: {
          key: 'alien_impress',
          type: 'TEXT',
          content: 'The best way to impress an alien visiting Earth.',
        },
        submissionDeadline: new Date(Date.now() - 60_000).toISOString(),
        submissionClosedAt: new Date(Date.now() - 30_000).toISOString(),
        votingDeadline: new Date(Date.now() + 30_000).toISOString(),
      },
    })

    renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])

    expect(await screen.findByRole('heading', { name: /round 1 voting/i })).toBeVisible()

    act(() => {
      fakeSocket.trigger('round:completed', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId,
        roundNumber: 1,
        rankings: [
          {
            submissionId: 'submission-2',
            authorId: participantId,
            likeCount: 3,
            dislikeCount: 1,
            score: 2,
          },
          {
            submissionId: 'submission-1',
            authorId: DEFAULT_AUTH_STATE.user.id,
            likeCount: 2,
            dislikeCount: 2,
            score: 0,
          },
        ],
        leaderboard: [
          { userId: participantId, cumulativeScore: 2, rank: 1 },
          { userId: DEFAULT_AUTH_STATE.user.id, cumulativeScore: 0, rank: 2 },
        ],
        nextRoundNumber: 2,
        isLastRound: false,
        occurredAt: new Date().toISOString(),
      })

      fakeSocket.trigger('round:created', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        roundId: nextRoundId,
        roundNumber: 2,
        phase: 'SUBMISSION',
        prompt: {
          key: 'unexpected_superpower',
          type: 'TEXT',
          content: 'The least useful superpower at a job interview.',
        },
        submissionDeadline: new Date(Date.now() + 30_000).toISOString(),
        occurredAt: new Date().toISOString(),
      })
    })

    expect(
      await screen.findByRole('heading', { name: /round 2 submission/i }),
    ).toBeVisible()
    expect(
      screen.getByText('The least useful superpower at a job interview.'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: /round 1 results/i })).toBeVisible()
    expect(screen.getByTestId('round-result-submission-2')).toHaveTextContent('3 likes')
    expect(screen.getByTestId('round-result-submission-2')).toHaveTextContent('1 dislike')
    expect(screen.getByTestId('round-result-submission-2')).toHaveTextContent('+2 points')
    expect(screen.getByTestId('round-result-submission-2')).not.toHaveTextContent(
      'Ranked response',
    )
    expect(screen.getByTestId('round-result-submission-2')).not.toHaveTextContent(
      'submission-2',
    )
    expect(screen.getByTestId('live-leaderboard')).toHaveTextContent(
      '1participant_two2 points',
    )
    expect(screen.getByTestId(`participant-${participantId}`)).toHaveTextContent(
      'Score: 2',
    )
  })

  it('shows the final tournament state, winner, and final standings automatically', async () => {
    const participantId = 'participant-2'

    setMockTournamentState({
      ...DEFAULT_TOURNAMENT_STATE,
      status: 'ACTIVE',
      participants: [
        ...DEFAULT_TOURNAMENT_STATE.participants,
        { userId: participantId, username: 'participant_two', cumulativeScore: 1 },
      ],
      currentRound: {
        id: 'final-round',
        number: 3,
        phase: 'VOTING',
        prompt: {
          key: 'final_prompt',
          type: 'TEXT',
          content: 'The final prompt.',
        },
        submissionDeadline: new Date(Date.now() - 60_000).toISOString(),
        submissionClosedAt: new Date(Date.now() - 30_000).toISOString(),
        votingDeadline: new Date(Date.now() + 30_000).toISOString(),
      },
    })

    renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])

    expect(await screen.findByRole('heading', { name: /round 3 voting/i })).toBeVisible()

    act(() => {
      fakeSocket.trigger('tournament:finished', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
        status: 'COMPLETED',
        overallWinnerId: participantId,
        finalLeaderboard: [
          { userId: participantId, cumulativeScore: 7, rank: 1 },
          { userId: DEFAULT_AUTH_STATE.user.id, cumulativeScore: 4, rank: 2 },
        ],
        occurredAt: new Date().toISOString(),
      })
    })

    expect(
      await screen.findByRole('heading', { name: /tournament finished/i }),
    ).toBeVisible()
    expect(screen.getByTestId('tournament-winner')).toHaveTextContent('participant_two')
    expect(screen.getByTestId('live-leaderboard')).toHaveTextContent(
      '1participant_two7 points',
    )
    expect(screen.queryByRole('button', { name: /^like$/i })).not.toBeInTheDocument()
    expect(
      screen.getByText((_content, element) => {
        return element?.textContent === 'Status: COMPLETED'
      }),
    ).toBeVisible()
  })

  it('blocks joining another tournament while an active live match exists', async () => {
    setMockTournamentState({
      ...DEFAULT_TOURNAMENT_STATE,
      ownerId: 'another-owner',
      participants: [{ userId: 'another-owner', cumulativeScore: 0 }],
    })
    setMockLiveTournamentState({
      hasActiveTournament: true,
      tournament: {
        id: 'active-tournament-id',
        title: 'Already Active Match',
        status: 'ACTIVE',
        roundId: 'active-round-id',
        roundNumber: 1,
        phase: 'SUBMISSION',
      },
    })

    renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])

    expect(
      await screen.findByRole('heading', { name: DEFAULT_TOURNAMENT_STATE.title }),
    ).toBeVisible()
    expect(screen.getByText(/already active in another tournament/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /join tournament/i })).toBeDisabled()
    expect(screen.getByRole('link', { name: /return to live match/i })).toHaveAttribute(
      'href',
      '/tournaments/active-tournament-id',
    )
  })
})
