import { useNavigate, useParams } from 'react-router-dom'

import { useAppSelector } from '@/app/providers/store'
import {
  useGetTournamentQuery,
  useJoinTournamentMutation,
} from '@/features/auth/api/tournaments-api'

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

          <p style={{ wordBreak: 'break-word' }}>
            <strong>Tournament ID:</strong>
            <br />
            {tournament.id}
          </p>

          <div>
            <h3>Participants</h3>

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
              </div>
            ))}

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
