import { useNavigate, useParams } from 'react-router-dom'

import { useGetTournamentQuery } from '@/features/auth/api/tournaments-api'

export function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()

  const {
    data: tournament,
    isLoading,
    isError,
  } = useGetTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId,
  })

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
              <p style={{ margin: 0 }}>
                <strong>Owner</strong>
              </p>

              <p
                style={{
                  margin: '8px 0 0',
                  wordBreak: 'break-word',
                }}
              >
                {tournament.ownerId}
              </p>
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
