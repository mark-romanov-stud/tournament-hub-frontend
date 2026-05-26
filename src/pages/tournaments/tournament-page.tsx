import { useNavigate, useParams } from 'react-router-dom'

import { useGetFullTournamentQuery } from '@/features/auth/api/tournaments-api'
import type { TournamentRealtimeEvent } from '@/features/tournaments/realtime/tournament-realtime'
import type { TournamentConnectionStatus } from '@/features/tournaments/realtime/use-tournament-realtime'
import { useTournamentRealtime } from '@/features/tournaments/realtime/use-tournament-realtime'

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

  const {
    data: tournament,
    isLoading,
    isError,
  } = useGetFullTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId,
  })
  const { connectionStatus, lastEvent, lastRecoveredAt } =
    useTournamentRealtime(tournamentId)

  if (isLoading) {
    return <p>Loading tournament...</p>
  }

  if (isError || !tournament) {
    return <p>Tournament not found.</p>
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
          <h2>{tournament.title}</h2>

          <TournamentRealtimePanel
            connectionStatus={connectionStatus}
            lastEvent={lastEvent}
            lastRecoveredAt={lastRecoveredAt}
          />

          <p
            style={{
              marginTop: '24px',
              marginBottom: '24px',
              wordBreak: 'break-word',
            }}
          >
            <strong>Tournament ID:</strong>
            <br />
            {tournament.id}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Description:</strong>
            <br />
            {tournament.description ?? 'No description'}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Visibility:</strong> {tournament.visibility}
          </p>

          <p style={{ marginBottom: '24px' }}>
            <strong>Rounds:</strong> {tournament.roundsCount}
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
              {tournament.participants.map((participant) => (
                <div key={participant.userId}>
                  <p style={{ margin: 0 }}>
                    <strong>
                      {participant.userId === tournament.ownerId
                        ? 'Owner'
                        : 'Participant'}
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
          </div>

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
