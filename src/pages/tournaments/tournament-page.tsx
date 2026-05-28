import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppSelector } from '@/app/providers/store'
import {
  createTournamentSocket,
  TournamentClientEvent,
  TournamentServerEvent,
} from '@/features/auth/api/tournament-socket'
import {
  type TournamentParticipant,
  useGetTournamentQuery,
  useJoinTournamentMutation,
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

type RealtimeStatus = 'idle' | 'connected' | 'failed' | 'room-error'

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

export function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const currentUser = useAppSelector((state) => state.auth.user)

  const [realtimeParticipants, setRealtimeParticipants] = useState<
    TournamentParticipant[] | null
  >(null)
  const [activeCount, setActiveCount] = useState(0)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle')

  const {
    data: tournament,
    isLoading,
    isError,
    refetch,
  } = useGetTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId,
  })

  const [joinTournament, { isLoading: isJoining, error: joinError }] =
    useJoinTournamentMutation()

  const displayedParticipants = useMemo(() => {
    return realtimeParticipants ?? tournament?.participants ?? []
  }, [realtimeParticipants, tournament?.participants])

  const isOwner = currentUser?.id === tournament?.ownerId
  const isParticipant = displayedParticipants.some(
    (participant) => participant.userId === currentUser?.id,
  )
  const canAccessRealtimeRoom = Boolean(tournamentId && (isOwner || isParticipant))

  const realtimeStatusLabel = useMemo(() => {
    if (!canAccessRealtimeRoom) {
      return 'Waiting for lobby access'
    }

    if (realtimeStatus === 'connected') {
      return 'Connected'
    }

    if (realtimeStatus === 'failed') {
      return 'Realtime connection failed'
    }

    if (realtimeStatus === 'room-error') {
      return 'Unable to join realtime room'
    }

    return 'Connecting...'
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
          const baseParticipants = currentParticipants ?? tournament?.participants ?? []

          const isAlreadyInList = baseParticipants.some(
            (participant) => participant.userId === payload.userId,
          )

          if (isAlreadyInList) {
            return baseParticipants
          }

          return [
            ...baseParticipants,
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
          const baseParticipants = currentParticipants ?? tournament?.participants ?? []

          return baseParticipants.filter(
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

      socket.disconnect()
    }
  }, [canAccessRealtimeRoom, tournament?.participants, tournamentId])

  if (isLoading) {
    return <p>Loading tournament...</p>
  }

  if (isError || !tournament || !tournamentId) {
    return <p>Tournament not found.</p>
  }

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
            <strong>Submission duration:</strong> {tournament.submissionDurationSeconds}{' '}
            seconds
          </p>

          <p>
            <strong>Vote duration:</strong> {tournament.voteDurationSeconds} seconds
          </p>

          <p>
            <strong>Realtime:</strong> {realtimeStatusLabel}
          </p>

          <p>
            <strong>Active users:</strong> {canAccessRealtimeRoom ? activeCount : 0}
          </p>

          <p style={{ wordBreak: 'break-word' }}>
            <strong>Tournament ID:</strong>
            <br />
            {tournament.id}
          </p>

          <div>
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
