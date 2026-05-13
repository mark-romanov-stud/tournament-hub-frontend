import { useLocation, useNavigate, useParams } from 'react-router-dom'

import type { Tournament } from '@/features/auth/api/tournaments-api'

interface TournamentLocationState {
  tournament?: Tournament
}

export function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const state = location.state as TournamentLocationState | null
  const tournament = state?.tournament

  return (
    <main className="createTournamentPage">
      <section className="createTournamentContent">
        <p className="eyebrow">Tournament Setup</p>

        <h1 className="createTournamentTitle">Tournament Created</h1>

        <p className="createTournamentDescription">
          Tournament was created successfully. The owner is already added as a
          participant.
        </p>

        <div className="createTournamentCard">
          <h2>{tournament?.title ?? 'Tournament'}</h2>

          <p
            style={{
              wordBreak: 'break-word',
              marginTop: '24px',
              marginBottom: '24px',
            }}
          >
            <strong>Tournament ID:</strong>
            <br />
            {tournament?.id ?? tournamentId}
          </p>

          {tournament ? (
            <>
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
            </>
          ) : (
            <p style={{ marginTop: '24px', marginBottom: '32px' }}>
              Tournament details are available right after creation. Refreshing this page
              clears temporary frontend state.
            </p>
          )}

          <button
            className="createButton"
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
