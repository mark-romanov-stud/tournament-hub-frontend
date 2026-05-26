import { Link, useNavigate } from 'react-router-dom'

import { useAppDispatch, useAppSelector } from '@/app/providers/store'
import { useLogoutMutation } from '@/features/auth/api/auth-api'
import { useGetTournamentsQuery } from '@/features/auth/api/tournaments-api'
import { authActions } from '@/features/auth/model/auth-slice'
import { clearStoredSession } from '@/features/auth/model/token-storage'

export function HomePage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [logout, { isLoading }] = useLogoutMutation()
  const user = useAppSelector((state) => state.auth.user)

  const {
    data: tournaments = [],
    isLoading: isTournamentsLoading,
    isError: isTournamentsError,
  } = useGetTournamentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })

  const handleLogout = async () => {
    try {
      await logout().unwrap()
    } catch {
      // Fail closed on the client even if the backend logout request fails.
    } finally {
      clearStoredSession()
      dispatch(authActions.sessionCleared())
      void navigate('/login', { replace: true })
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <p className="dashboard-card__eyebrow">Authenticated space</p>

        <h1>Curator Dashboard</h1>

        <p className="dashboard-card__copy">
          The private route is active. The authenticated shell is now reserved for
          signed-in curators only.
        </p>

        <dl className="dashboard-card__meta">
          <div>
            <dt>Username</dt>
            <dd>{user?.username ?? 'Unknown curator'}</dd>
          </div>

          <div>
            <dt>Email</dt>
            <dd>{user?.email ?? 'Unknown email'}</dd>
          </div>
        </dl>

        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginTop: '24px',
            flexWrap: 'wrap',
          }}
        >
          <Link
            to="/tournaments/create"
            className="auth-button auth-button--primary dashboard-card__action"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Create Tournament
          </Link>

          <button
            className="auth-button auth-button--primary dashboard-card__action"
            disabled={isLoading}
            type="button"
            onClick={() => {
              void handleLogout()
            }}
          >
            {isLoading ? 'Logging out...' : 'Log Out'}
          </button>
        </div>

        <div style={{ marginTop: '32px' }}>
          <h2 style={{ marginBottom: '16px' }}>Tournaments</h2>

          {isTournamentsLoading ? <p>Loading tournaments...</p> : null}

          {isTournamentsError ? <p>Failed to load tournaments.</p> : null}

          {!isTournamentsLoading && !isTournamentsError && tournaments.length === 0 ? (
            <p>No tournaments yet.</p>
          ) : null}

          <div style={{ display: 'grid', gap: '12px' }}>
            {tournaments.map((tournament) => (
              <div
                key={tournament.id}
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  background: '#eef3fb',
                }}
              >
                <strong>{tournament.title}</strong>

                <p style={{ margin: '8px 0 12px' }}>Status: {tournament.status}</p>

                <Link
                  to={`/tournaments/${tournament.id}`}
                  className="auth-button auth-button--primary"
                  style={{
                    minHeight: '44px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  Open Tournament
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
