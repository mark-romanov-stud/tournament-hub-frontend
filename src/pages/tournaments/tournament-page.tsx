import { type FormEvent, useEffect, useMemo, useReducer, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppSelector } from '@/app/providers/store'
import {
  type FullTournament,
  type RoundPromptContent,
  useGetFullTournamentQuery,
  useGetTournamentQuery,
  useJoinTournamentMutation,
  useUpsertRoundSubmissionMutation,
} from '@/features/auth/api/tournaments-api'
import type { TournamentRealtimeEvent } from '@/features/tournaments/realtime/tournament-realtime'
import type { TournamentConnectionStatus } from '@/features/tournaments/realtime/use-tournament-realtime'
import { useTournamentRealtime } from '@/features/tournaments/realtime/use-tournament-realtime'

interface SubmissionProgress {
  roundId: string
  submittedCount: number
  totalActiveParticipants: number
}

interface TournamentRoundViewState {
  createdRound: FullTournament['currentRound']
  phaseOverride: {
    roundId: string
    phase: 'VOTING'
    submissionClosedAt: string
  } | null
  progress: SubmissionProgress | null
}

type TournamentRoundViewAction =
  | {
      type: 'roundCreated'
      round: NonNullable<FullTournament['currentRound']>
      totalActiveParticipants: number
    }
  | { type: 'progressUpdated'; progress: SubmissionProgress }
  | {
      type: 'phaseChanged'
      roundId: string
      phase: 'VOTING'
      submissionClosedAt: string
    }

const initialTournamentRoundViewState: TournamentRoundViewState = {
  createdRound: null,
  phaseOverride: null,
  progress: null,
}

interface RoundCreatedPayload {
  tournamentId: string
  roundId: string
  roundNumber: number
  phase: 'SUBMISSION'
  prompt: {
    key: string
    type: string
    content: RoundPromptContent
  }
  submissionDeadline: string
}

interface RoundProgressPayload {
  tournamentId: string
  roundId: string
  phase: 'SUBMISSION'
  submittedCount: number
  totalActiveParticipants: number
}

interface RoundPhaseChangedPayload {
  tournamentId: string
  roundId: string
  roundNumber: number
  currentPhase: 'VOTING'
  occurredAt?: string
}

interface VotingSubmissionRevealedPayload {
  tournamentId: string
  roundId: string
  votingDeadline: string
}

const realtimeStatusCopy: Record<
  TournamentConnectionStatus,
  { label: string; tone: string; title: string; description: string }
> = {
  connected: {
    label: 'Connected',
    tone: 'connected',
    title: 'Live room connected',
    description: 'You are subscribed to realtime tournament updates.',
  },
  connecting: {
    label: 'Reconnecting',
    tone: 'connecting',
    title: 'Trying to reconnect',
    description: 'The client is restoring the socket connection.',
  },
  disconnected: {
    label: 'Disconnected',
    tone: 'disconnected',
    title: 'Connection lost',
    description: 'Realtime updates are paused until the socket reconnects.',
  },
  idle: {
    label: 'Waiting',
    tone: 'idle',
    title: 'Realtime is preparing',
    description: 'The tournament room subscription has not started yet.',
  },
  recovering: {
    label: 'Recovering',
    tone: 'recovering',
    title: 'Reconnected, restoring state',
    description: 'The room is joined again and tournament state is being refreshed.',
  },
}

function getApiErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: { message?: string[] | string } }).data

    if (Array.isArray(data?.message) && data.message.length > 0) {
      return data.message[0] ?? 'Failed to join tournament. Please try again.'
    }

    if (typeof data?.message === 'string') {
      return data.message
    }
  }

  return 'Failed to join tournament. Please try again.'
}

function TournamentRealtimePanel({
  connectionStatus,
  lastEvent,
  lastRecoveredAt,
}: {
  connectionStatus: TournamentConnectionStatus
  lastEvent: TournamentRealtimeEvent | null
  lastRecoveredAt: string | null
}) {
  const status = realtimeStatusCopy[connectionStatus]

  return (
    <section
      className={`tournament-realtime-panel tournament-realtime-panel-${status.tone}`}
      aria-live="polite"
    >
      <div className="tournament-realtime-panel-header">
        <div>
          <p className="tournament-realtime-panel-eyebrow">Realtime room</p>
          <h3>{status.title}</h3>
        </div>

        <span
          className="tournament-realtime-panel-badge"
          data-testid="tournament-realtime-status"
        >
          <span className="tournament-realtime-panel-dot" />
          {status.label}
        </span>
      </div>

      <p className="tournament-realtime-panel-copy">{status.description}</p>

      {lastRecoveredAt ? (
        <p
          className="tournament-realtime-panel-recovery"
          data-testid="tournament-recovery-note"
        >
          State recovered after reconnect at {lastRecoveredAt}
        </p>
      ) : null}

      {lastEvent ? (
        <p
          className="tournament-realtime-panel-event"
          data-testid="tournament-latest-event"
        >
          Latest event: <strong>{lastEvent.name}</strong>
        </p>
      ) : (
        <p className="tournament-realtime-panel-event">Waiting for first event…</p>
      )}
    </section>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function tournamentRoundViewReducer(
  state: TournamentRoundViewState,
  action: TournamentRoundViewAction,
): TournamentRoundViewState {
  switch (action.type) {
    case 'roundCreated':
      return {
        createdRound: action.round,
        phaseOverride: null,
        progress: {
          roundId: action.round.id,
          submittedCount: 0,
          totalActiveParticipants: action.totalActiveParticipants,
        },
      }
    case 'progressUpdated':
      return {
        ...state,
        progress: action.progress,
      }
    case 'phaseChanged':
      return {
        ...state,
        phaseOverride: {
          roundId: action.roundId,
          phase: action.phase,
          submissionClosedAt: action.submissionClosedAt,
        },
      }
  }
}

function isRoundCreatedPayload(payload: unknown): payload is RoundCreatedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    typeof payload.roundNumber === 'number' &&
    payload.phase === 'SUBMISSION' &&
    isRecord(payload.prompt) &&
    typeof payload.prompt.key === 'string' &&
    typeof payload.prompt.type === 'string' &&
    typeof payload.submissionDeadline === 'string'
  )
}

function isRoundProgressPayload(payload: unknown): payload is RoundProgressPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    payload.phase === 'SUBMISSION' &&
    typeof payload.submittedCount === 'number' &&
    typeof payload.totalActiveParticipants === 'number'
  )
}

function isRoundPhaseChangedPayload(
  payload: unknown,
): payload is RoundPhaseChangedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    typeof payload.roundNumber === 'number' &&
    payload.currentPhase === 'VOTING'
  )
}

function isVotingSubmissionRevealedPayload(
  payload: unknown,
): payload is VotingSubmissionRevealedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    typeof payload.votingDeadline === 'string'
  )
}

function getPromptText(content: RoundPromptContent) {
  return typeof content === 'string' ? content : content.en
}

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(deadline))
}

function getRemainingSeconds(deadline: string) {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
}

function useRemainingSeconds(deadline: string | null) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    deadline ? getRemainingSeconds(deadline) : 0,
  )

  useEffect(() => {
    if (!deadline) {
      return
    }

    const intervalId = window.setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(deadline))
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [deadline])

  return remainingSeconds
}

function TournamentRoundPhasePanel({
  tournament,
  lastEvent,
}: {
  tournament: FullTournament
  lastEvent: TournamentRealtimeEvent | null
}) {
  const [viewState, dispatch] = useReducer(
    tournamentRoundViewReducer,
    initialTournamentRoundViewState,
  )

  useEffect(() => {
    if (!lastEvent) {
      return
    }

    if (lastEvent.name === 'round:created') {
      const payload = lastEvent.payload

      if (isRoundCreatedPayload(payload) && payload.tournamentId === tournament.id) {
        dispatch({
          type: 'roundCreated',
          round: {
            id: payload.roundId,
            number: payload.roundNumber,
            phase: payload.phase,
            prompt: payload.prompt,
            submissionDeadline: payload.submissionDeadline,
            submissionClosedAt: null,
            votingDeadline: null,
          },
          totalActiveParticipants: tournament.participants.length,
        })
      }

      return
    }

    if (lastEvent.name === 'round:progress_updated') {
      const payload = lastEvent.payload

      if (isRoundProgressPayload(payload) && payload.tournamentId === tournament.id) {
        dispatch({
          type: 'progressUpdated',
          progress: {
            roundId: payload.roundId,
            submittedCount: payload.submittedCount,
            totalActiveParticipants: payload.totalActiveParticipants,
          },
        })
      }

      return
    }

    if (lastEvent.name === 'round:phase_changed') {
      const payload = lastEvent.payload

      if (isRoundPhaseChangedPayload(payload) && payload.tournamentId === tournament.id) {
        dispatch({
          type: 'phaseChanged',
          roundId: payload.roundId,
          phase: payload.currentPhase,
          submissionClosedAt: payload.occurredAt ?? new Date().toISOString(),
        })
      }
    }

    if (lastEvent.name === 'voting:submission_revealed') {
      const payload = lastEvent.payload

      if (
        isVotingSubmissionRevealedPayload(payload) &&
        payload.tournamentId === tournament.id
      ) {
        dispatch({
          type: 'phaseChanged',
          roundId: payload.roundId,
          phase: 'VOTING',
          submissionClosedAt: new Date().toISOString(),
        })
      }
    }
  }, [lastEvent, tournament.id, tournament.participants.length])

  let currentRound = viewState.createdRound ?? tournament.currentRound

  if (currentRound && viewState.phaseOverride?.roundId === currentRound.id) {
    currentRound = {
      ...currentRound,
      phase: viewState.phaseOverride.phase,
      submissionClosedAt: viewState.phaseOverride.submissionClosedAt,
    }
  }

  if (lastEvent?.name === 'round:phase_changed') {
    const payload = lastEvent.payload
    if (
      currentRound &&
      isRoundPhaseChangedPayload(payload) &&
      payload.tournamentId === tournament.id &&
      payload.roundId === currentRound.id
    ) {
      currentRound = {
        ...currentRound,
        phase: payload.currentPhase,
        submissionClosedAt: payload.occurredAt ?? new Date().toISOString(),
      }
    }
  }

  if (!currentRound) {
    return (
      <section className="tournament-phase-panel">
        <h3>Waiting for Round</h3>
        <p>The tournament has not started an active round yet.</p>
      </section>
    )
  }

  if (currentRound.phase === 'SUBMISSION') {
    return (
      <SubmissionPhasePanel
        participantCount={tournament.participants.length}
        progress={viewState.progress}
        round={currentRound}
      />
    )
  }

  return (
    <section className="tournament-phase-panel" aria-live="polite">
      <p className="tournament-phase-eyebrow">Active round</p>
      <h3>Round {currentRound.number} Voting</h3>
      <p>
        The submission phase has ended. Responses will be revealed one at a time for
        voting.
      </p>
    </section>
  )
}

function SubmissionPhasePanel({
  participantCount,
  progress,
  round,
}: {
  participantCount: number
  progress: SubmissionProgress | null
  round: NonNullable<FullTournament['currentRound']>
}) {
  const [content, setContent] = useState('')
  const [isSaved, setIsSaved] = useState(false)
  const [upsertSubmission, { isLoading, isError }] = useUpsertRoundSubmissionMutation()
  const remainingSeconds = useRemainingSeconds(round.submissionDeadline)
  const submittedCount = progress?.roundId === round.id ? progress.submittedCount : 0
  const totalParticipants =
    progress?.roundId === round.id ? progress.totalActiveParticipants : participantCount
  const progressPercent = useMemo(() => {
    if (totalParticipants <= 0) {
      return 0
    }

    return Math.min(100, Math.round((submittedCount / totalParticipants) * 100))
  }, [submittedCount, totalParticipants])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!content.trim()) {
      return
    }

    await upsertSubmission({
      roundId: round.id,
      content: content.trim(),
    }).unwrap()
    setIsSaved(true)
  }

  return (
    <section className="tournament-phase-panel" aria-live="polite">
      <div className="tournament-phase-header">
        <div>
          <p className="tournament-phase-eyebrow">Active round</p>
          <h3>Round {round.number} Submission</h3>
        </div>
        <span className="tournament-phase-badge" data-testid="submission-countdown">
          {remainingSeconds} seconds remaining
        </span>
      </div>

      <div className="tournament-prompt">
        <p className="tournament-prompt-label">Prompt</p>
        <p>{getPromptText(round.prompt.content)}</p>
        <span className="tournament-prompt-deadline">
          Deadline: {formatDeadline(round.submissionDeadline)}
        </span>
      </div>

      <div className="submission-progress" data-testid="submission-progress">
        <div className="submission-progress-copy">
          <strong>
            {submittedCount} of {totalParticipants} submitted
          </strong>
          <span className="submission-progress-note">
            Submissions are hidden until voting starts.
          </span>
        </div>
        <div
          className="submission-progress-track"
          role="progressbar"
          aria-label="Submission progress"
          aria-valuemin={0}
          aria-valuemax={totalParticipants}
          aria-valuenow={submittedCount}
        >
          <span
            className="submission-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <form
        className="submission-form"
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
      >
        <label htmlFor="round-submission">Your submission</label>
        <textarea
          className="submission-form-textarea"
          id="round-submission"
          maxLength={4000}
          value={content}
          onChange={(event) => {
            setContent(event.target.value)
            setIsSaved(false)
          }}
          placeholder="Write your response before the timer ends."
        />

        {isError ? (
          <p className="form-error">Could not save submission. Try again.</p>
        ) : null}
        {isSaved ? <p className="submission-saved">Submission saved.</p> : null}

        <button className="create-button" type="submit" disabled={isLoading}>
          {isLoading ? 'Submitting...' : 'Submit Response'}
        </button>
      </form>
    </section>
  )
}

export function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const currentUser = useAppSelector((state) => state.auth.user)
  const [hasJoined, setHasJoined] = useState(false)

  const {
    data: draftTournament,
    isLoading: isDraftLoading,
    isError: isDraftError,
    refetch: refetchDraftTournament,
  } = useGetTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId,
  })

  const draftParticipants = draftTournament?.participants ?? []
  const isOwner = currentUser?.id === draftTournament?.ownerId
  const isDraftParticipant = draftParticipants.some(
    (participant) => participant.userId === currentUser?.id,
  )
  const canViewFullTournament = isOwner || isDraftParticipant || hasJoined

  const {
    data: fullTournament,
    isLoading: isFullLoading,
    isError: isFullError,
    refetch: refetchFullTournament,
  } = useGetFullTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId || (!canViewFullTournament && !isDraftError),
  })

  const { connectionStatus, lastEvent, lastRecoveredAt } = useTournamentRealtime(
    fullTournament ? tournamentId : undefined,
  )

  const [joinTournament, { isLoading: isJoining, error: joinError }] =
    useJoinTournamentMutation()

  if (isDraftLoading || isFullLoading) {
    return <p>Loading tournament...</p>
  }

  const activeTournament = fullTournament ?? draftTournament

  if (!activeTournament || !tournamentId || (isDraftError && isFullError)) {
    return <p>Tournament not found.</p>
  }

  const participants = fullTournament?.participants ?? draftParticipants

  const isParticipant = participants.some(
    (participant) => participant.userId === currentUser?.id,
  )

  const canJoin = activeTournament.status === 'DRAFT' && !isOwner && !isParticipant

  const handleJoin = async () => {
    const joinPayload = draftTournament?.inviteToken
      ? { tournamentId, inviteToken: draftTournament.inviteToken }
      : { tournamentId }

    await joinTournament(joinPayload).unwrap()
    setHasJoined(true)
    await refetchDraftTournament()
    await refetchFullTournament()
  }

  return (
    <main className="create-tournament-page">
      <section className="create-tournament-content">
        <p className="eyebrow">Tournament Setup</p>

        <h1 className="create-tournament-title">Tournament Created</h1>

        <p className="create-tournament-description">
          Tournament was created successfully. The owner is already added as a
          participant.
        </p>

        <div className="create-tournament-card">
          <h2>{activeTournament.title}</h2>

          {fullTournament ? (
            <>
              <TournamentRealtimePanel
                connectionStatus={connectionStatus}
                lastEvent={lastEvent}
                lastRecoveredAt={lastRecoveredAt}
              />

              <TournamentRoundPhasePanel
                key={`${fullTournament.id}-${fullTournament.currentRound?.id ?? 'waiting'}`}
                tournament={fullTournament}
                lastEvent={lastEvent}
              />
            </>
          ) : null}

          {joinError ? (
            <p className="form-error">{getApiErrorMessage(joinError)}</p>
          ) : null}

          <p style={{ marginBottom: '16px' }}>
            <strong>Status:</strong> {activeTournament.status}
          </p>

          <p
            style={{
              marginTop: '24px',
              marginBottom: '24px',
              wordBreak: 'break-word',
            }}
          >
            <strong>Tournament ID:</strong>
            <br />
            {activeTournament.id}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Description:</strong>
            <br />
            {activeTournament.description ?? 'No description'}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Visibility:</strong> {activeTournament.visibility}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Rounds:</strong> {activeTournament.roundsCount}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Submission duration:</strong>{' '}
            {activeTournament.submissionDurationSeconds} seconds
          </p>

          <p style={{ marginBottom: '24px' }}>
            <strong>Vote duration:</strong> {activeTournament.voteDurationSeconds} seconds
          </p>

          <div style={{ marginBottom: '32px' }}>
            <h3>Participants</h3>

            <div
              style={{
                marginTop: '12px',
                padding: '16px',
                borderRadius: '16px',
                background: '#eef3fb',
              }}
            >
              {participants.map((participant) => (
                <div key={participant.userId}>
                  <p style={{ margin: 0 }}>
                    <strong>
                      {participant.userId === activeTournament.ownerId
                        ? 'Owner'
                        : 'Participant'}
                      {participant.userId === currentUser?.id ? ' · You' : ''}
                    </strong>
                  </p>

                  <p
                    style={{
                      margin: '8px 0 0',
                      wordBreak: 'break-word',
                    }}
                  >
                    {participant.userId}
                  </p>
                </div>
              ))}
            </div>

            {isParticipant && !isOwner ? (
              <div
                style={{
                  marginTop: '12px',
                  padding: '16px',
                  borderRadius: '16px',
                  background: '#eef3fb',
                }}
              >
                <p style={{ margin: 0 }}>
                  <strong>You joined this tournament</strong>
                </p>
              </div>
            ) : null}
          </div>

          {canJoin ? (
            <button
              className="create-button"
              disabled={isJoining}
              onClick={() => {
                void handleJoin()
              }}
            >
              {isJoining ? 'Joining...' : 'Join Tournament'}
            </button>
          ) : null}

          <button
            className="create-button"
            onClick={() => {
              void navigate('/')
            }}
          >
            Go To Home Page
          </button>
        </div>
      </section>
    </main>
  )
}
