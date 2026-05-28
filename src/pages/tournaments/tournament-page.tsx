import { useNavigate, useParams } from 'react-router-dom'

import { useAppSelector } from '@/app/providers/store'
import {
  useGetFullTournamentQuery,
  useJoinTournamentMutation,
} from '@/features/auth/api/tournaments-api'
import type { TournamentRealtimeEvent } from '@/features/tournaments/realtime/tournament-realtime'
import type { TournamentConnectionStatus } from '@/features/tournaments/realtime/use-tournament-realtime'
import { useTournamentRealtime } from '@/features/tournaments/realtime/use-tournament-realtime'

const getApiErrorMessage = (error: unknown) => {
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

export function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const currentUser = useAppSelector((state) => state.auth.user)

  const {
    data: tournament,
    isLoading,
    isError,
    refetch,
  } = useGetFullTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId,
  })

  const [joinTournament, { isLoading: isJoining, error: joinError }] =
    useJoinTournamentMutation()

  const { connectionStatus, lastEvent, lastRecoveredAt } =
    useTournamentRealtime(tournamentId)

  if (isLoading) {
    return <p>Loading tournament...</p>
  }

  if (isError || !tournament || !tournamentId) {
    return <p>Tournament not found.</p>
  }

  const participants = tournament.participants ?? []
  const isOwner = currentUser?.id === tournament.ownerId
  const isParticipant = participants.some(
    (participant) => participant.userId === currentUser?.id,
  )
  const canJoin = tournament.status === 'DRAFT' && !isOwner && !isParticipant

  const handleJoin = async () => {
    const joinPayload = tournament.inviteToken
      ? { tournamentId, inviteToken: tournament.inviteToken }
      : { tournamentId }

    await joinTournament(joinPayload).unwrap()
    await refetch()
  }

  return (
    <main className="create-tournament-page">
      <section className="create-tournament-content">
        <p className="eyebrow">Tournament</p>

        <h1 className="create-tournament-title">{tournament.title}</h1>

        <p className="create-tournament-description">
          {tournament.description ?? 'No description'}
        </p>

        <div className="create-tournament-card">
          {joinError ? (
            <p className="form-error">{getApiErrorMessage(joinError)}</p>
          ) : null}

          <TournamentRealtimePanel
            connectionStatus={connectionStatus}
            lastEvent={lastEvent}
            lastRecoveredAt={lastRecoveredAt}
          />

          <p>
            <strong>Status:</strong> {tournament.status}
          </p>

          <p>
            <strong>Visibility:</strong> {tournament.visibility}
          </p>

          <p>
            <strong>Rounds:</strong> {tournament.roundsCount}
          </p>

          <p>
            <strong>Submission duration:</strong>{' '}
            {tournament.submissionDurationSeconds} seconds
          </p>

          <p>
            <strong>Vote duration:</strong> {tournament.voteDurationSeconds} seconds
          </p>

          <p style={{ wordBreak: 'break-word' }}>
            <strong>Tournament ID:</strong>
            <br />
            {tournament.id}
          </p>

          <div>
            <h3>Participants</h3>

            {participants.length === 0 ? <p>No participants yet.</p> : null}

            {participants.map((participant) => (
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

                <p style={{ margin: '8px 0 0' }}>
                  Score: {participant.cumulativeScore}
                </p>
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