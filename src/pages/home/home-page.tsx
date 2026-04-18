import { useNavigate } from 'react-router-dom'

import { useAppDispatch, useAppSelector } from '@/app/providers/store'
import { useLogoutMutation } from '@/features/auth/api/auth-api'
import { authActions } from '@/features/auth/model/auth-slice'
import { clearStoredSession } from '@/features/auth/model/token-storage'

export function HomePage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [logout, { isLoading }] = useLogoutMutation()
  const user = useAppSelector((state) => state.auth.user)

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
      </section>
    </main>
  )
}
