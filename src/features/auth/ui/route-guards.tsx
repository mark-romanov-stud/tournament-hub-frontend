import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'

import { useAppSelector } from '@/app/providers/store'
import { LiveTournamentRecoveryProvider } from '@/features/tournaments/live/live-tournament-recovery'

function SessionGate() {
  return (
    <main className="session-gate">
      <div className="session-gate__signal" />
      <p className="session-gate__copy">Restoring your session...</p>
    </main>
  )
}

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { bootstrapStatus, tokens, user } = useAppSelector((state) => state.auth)

  if (bootstrapStatus === 'loading') {
    return <SessionGate />
  }

  if (!tokens?.accessToken || !user) {
    return <Navigate replace to="/login" />
  }

  return <LiveTournamentRecoveryProvider>{children}</LiveTournamentRecoveryProvider>
}

export function GuestRoute({ children }: { children: ReactElement }) {
  const { bootstrapStatus, tokens, user } = useAppSelector((state) => state.auth)

  if (bootstrapStatus === 'loading') {
    return <SessionGate />
  }

  if (tokens?.accessToken && user) {
    return <Navigate replace to="/" />
  }

  return children
}
