import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  createTournamentSocket,
  TournamentClientEvent,
  TournamentServerEvent,
} from '@/features/auth/api/tournament-socket'
import {
  type TournamentParticipant,
  useGetTournamentQuery,
} from '@/features/auth/api/tournaments-api'

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

export function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()

  const [realtimeParticipants, setRealtimeParticipants] = useState<
    TournamentParticipant[]
  >([])
  const [activeCount, setActiveCount] = useState(0)
  const [realtimeStatus, setRealtimeStatus] = useState('Connecting...')

  const {
    data: tournament,
    isLoading,
    isError,
  } = useGetTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId,
  })

  const displayedParticipants = useMemo(() => {
    return realtimeParticipants.length > 0
      ? realtimeParticipants
      : (tournament?.participants ?? [])
  }, [realtimeParticipants, tournament?.participants])

  useEffect(() => {
    if (!tournamentId) {
      return
    }

    const socket = createTournamentSocket()

    socket.on('connect', () => {
      setRealtimeStatus('Connected')

      socket.emit(
        TournamentClientEvent.JOIN,
        { tournamentId },
        (ack?: { success?: boolean }) => {
          if (!ack?.success) {
            setRealtimeStatus('Unable to join realtime room')
          }
        },
      )
    })

    socket.on('connect_error', () => {
      setRealtimeStatus('Realtime connection failed')
    })

    socket.on(
      TournamentServerEvent.PARTICIPANT_JOINED,
      (payload: ParticipantEventPayload) => {
        if (payload.tournamentId !== tournamentId) {
          return
        }

        setRealtimeParticipants((currentParticipants) => {
          const isAlreadyInList = currentParticipants.some(
            (participant) => participant.userId === payload.userId,
          )

          if (isAlreadyInList) {
            return currentParticipants
          }

          return [
            ...currentParticipants,
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

        setRealtimeParticipants((currentParticipants) =>
          currentParticipants.filter(
            (participant) => participant.userId !== payload.userId,
          ),
        )
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
      socket.emit(TournamentClientEvent.LEAVE, { tournamentId })
      socket.disconnect()
    }
  }, [tournamentId])

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

          <p style={{ marginBottom: '16px' }}>
            <strong>Status:</strong> {tournament.status}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Rounds:</strong> {tournament.roundsCount}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Realtime:</strong> {realtimeStatus}
          </p>

          <p style={{ marginBottom: '24px' }}>
            <strong>Active users:</strong> {activeCount}
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
