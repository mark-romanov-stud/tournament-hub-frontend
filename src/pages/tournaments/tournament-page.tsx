import { type FormEvent, useEffect, useMemo, useReducer, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppSelector } from '@/app/providers/store'
import {
  createTournamentSocket,
  TournamentClientEvent,
  TournamentServerEvent,
} from '@/features/auth/api/tournament-socket'
import {
  type FullTournament,
  type RoundPromptContent,
  type TournamentParticipant,
  useGetFullTournamentQuery,
  useGetTournamentQuery,
  useJoinTournamentMutation,
  useLeaveTournamentMutation,
  useUpsertRoundSubmissionMutation,
} from '@/features/auth/api/tournaments-api'
import type { TournamentRealtimeEvent } from '@/features/tournaments/realtime/tournament-realtime'
import { useTournamentRealtime } from '@/features/tournaments/realtime/use-tournament-realtime'

interface ParticipantEventPayload {
  tournamentId: string
  userId: string
  occurredAt: string
}

interface PresenceUpdatedPayload {
  tournamentId: string
  activeCount: number
  occurredAt: string
}

type RealtimeStatus = 'idle' | 'connected' | 'failed' | 'room-error'

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

  const [realtimeParticipants, setRealtimeParticipants] = useState<
    TournamentParticipant[] | null
  >(null)
  const [activeCount, setActiveCount] = useState(0)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle')

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
  } = useGetFullTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId || (!canViewFullTournament && !isDraftError),
  })

  const tournament = fullTournament ?? draftTournament
  const baseParticipants = fullTournament?.participants ?? draftParticipants
  const displayedParticipants = realtimeParticipants ?? baseParticipants

  const isParticipant = displayedParticipants.some(
    (participant) => participant.userId === currentUser?.id,
  )
  const canAccessRealtimeRoom = Boolean(tournamentId && (isOwner || isParticipant))

  const { connectionStatus, lastEvent, lastRecoveredAt } = useTournamentRealtime(
    canAccessRealtimeRoom ? tournamentId : undefined,
  )

  const [joinTournament, { isLoading: isJoining, error: joinError }] =
    useJoinTournamentMutation()

  const [leaveTournament, { isLoading: isLeaving, error: leaveError }] =
    useLeaveTournamentMutation()

  const realtimeStatusLabel = useMemo(() => {
    if (!canAccessRealtimeRoom) {
      return 'Waiting for lobby access'
    }

    switch (realtimeStatus) {
      case 'connected':
        return 'Connected'

      case 'failed':
        return 'Realtime connection failed'

      case 'room-error':
        return 'Unable to join realtime room'

      default:
        return 'Connecting...'
    }
  }, [canAccessRealtimeRoom, realtimeStatus])

  useEffect(() => {
    if (!tournamentId || !canAccessRealtimeRoom) {
      return
    }

    const socket = createTournamentSocket()

    socket.on('connect', () => {
      setRealtimeStatus('connected')

      socket.emit(
        TournamentClientEvent.JOIN,
        { tournamentId },
        (ack?: { success?: boolean }) => {
          if (!ack?.success) {
            setRealtimeStatus('room-error')
          }
        },
      )
    })

    socket.on('connect_error', () => {
      setRealtimeStatus('failed')
    })

    socket.on(
      TournamentServerEvent.PARTICIPANT_JOINED,
      (payload: ParticipantEventPayload) => {
        if (payload.tournamentId !== tournamentId) {
          return
        }

        setRealtimeParticipants((currentParticipants) => {
          const participants = currentParticipants ?? baseParticipants
          const isAlreadyInList = participants.some(
            (participant) => participant.userId === payload.userId,
          )

          if (isAlreadyInList) {
            return participants
          }

          return [
            ...participants,
            {
              userId: payload.userId,
              cumulativeScore: 0,
            },
          ]
        })
      },
    )

    socket.on(
      TournamentServerEvent.PARTICIPANT_LEFT,
      (payload: ParticipantEventPayload) => {
        if (payload.tournamentId !== tournamentId) {
          return
        }

        setRealtimeParticipants((currentParticipants) => {
          const participants = currentParticipants ?? baseParticipants

          return participants.filter(
            (participant) => participant.userId !== payload.userId,
          )
        })
      },
    )

    socket.on(
      TournamentServerEvent.PRESENCE_UPDATED,
      (payload: PresenceUpdatedPayload) => {
        if (payload.tournamentId !== tournamentId) {
          return
        }

        setActiveCount(payload.activeCount)
      },
    )

    return () => {
      if (socket.connected) {
        socket.emit(TournamentClientEvent.LEAVE, { tournamentId })
      }

      socket.off('connect')
      socket.off('connect_error')
      socket.off('disconnect')
      socket.off(TournamentServerEvent.PARTICIPANT_JOINED)
      socket.off(TournamentServerEvent.PARTICIPANT_LEFT)
      socket.off(TournamentServerEvent.PRESENCE_UPDATED)
    }
  }, [baseParticipants, canAccessRealtimeRoom, tournamentId])

  if (isDraftLoading || isFullLoading) {
    return <p>Loading tournament...</p>
  }

  if (!tournament || !tournamentId || (isDraftError && isFullError)) {
    return <p>Tournament not found.</p>
  }

  const canJoin = tournament.status === 'DRAFT' && !isOwner && !isParticipant
  const canLeave = tournament.status === 'DRAFT' && !isOwner && isParticipant

  const handleJoin = async () => {
    const joinPayload = draftTournament?.inviteToken
      ? { tournamentId, inviteToken: draftTournament.inviteToken }
      : { tournamentId }

    await joinTournament(joinPayload).unwrap()
    setHasJoined(true)
    await refetchDraftTournament()
  }

  const handleLeave = async () => {
    await leaveTournament(tournamentId).unwrap()
    setHasJoined(false)
    setRealtimeParticipants((currentParticipants) =>
      (currentParticipants ?? baseParticipants).filter(
        (participant) => participant.userId !== currentUser?.id,
      ),
    )
    await refetchDraftTournament()
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

          {fullTournament ? (
            <>
              <section className="tournament-realtime-panel" aria-live="polite">
                <span data-testid="tournament-realtime-status">
                  {connectionStatus === 'connected'
                    ? 'Connected'
                    : connectionStatus === 'disconnected'
                      ? 'Disconnected'
                      : 'Connecting'}
                </span>

                {lastRecoveredAt ? (
                  <p data-testid="tournament-recovery-note">
                    State recovered after reconnect at {lastRecoveredAt}
                  </p>
                ) : null}

                {lastEvent ? (
                  <p data-testid="tournament-latest-event">
                    Latest event: <strong>{lastEvent.name}</strong>
                  </p>
                ) : null}
              </section>

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

          {leaveError ? (
            <p className="form-error">{getApiErrorMessage(leaveError)}</p>
          ) : null}

          <p style={{ marginBottom: '16px' }}>
            <strong>Status:</strong> {tournament.status}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Visibility:</strong> {tournament.visibility}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Rounds:</strong> {tournament.roundsCount}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Submission duration:</strong> {tournament.submissionDurationSeconds}{' '}
            seconds
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Vote duration:</strong> {tournament.voteDurationSeconds} seconds
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Realtime:</strong> {realtimeStatusLabel}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Active users:</strong> {canAccessRealtimeRoom ? activeCount : 0}
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

          <div style={{ marginBottom: '32px' }}>
            <h3>Participants</h3>

            {displayedParticipants.length === 0 ? <p>No participants yet.</p> : null}

            {displayedParticipants.map((participant) => (
              <div
                key={participant.userId}
                style={{
                  marginTop: '12px',
                  padding: '16px',
                  borderRadius: '16px',
                  background: '#eef3fb',
                }}
              >
                <p style={{ margin: 0 }}>
                  <strong>
                    {participant.userId === tournament.ownerId ? 'Owner' : 'Participant'}
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

                <p style={{ margin: '8px 0 0' }}>Score: {participant.cumulativeScore}</p>
              </div>
            ))}
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

          {canLeave ? (
            <button
              className="create-button"
              disabled={isLeaving}
              onClick={() => {
                void handleLeave()
              }}
            >
              {isLeaving ? 'Leaving...' : 'Leave Tournament'}
            </button>
          ) : null}

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
