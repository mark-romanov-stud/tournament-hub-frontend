import { type ReactNode, useMemo } from 'react'
import { Link } from 'react-router-dom'

import { useAppSelector } from '@/app/providers/store'
import { useGetLiveTournamentQuery } from '@/features/auth/api/auth-api'
import { LiveTournamentRecoveryContext } from '@/features/tournaments/live/live-tournament-recovery-context'

function formatPhase(phase: string) {
  return phase.charAt(0) + phase.slice(1).toLowerCase()
}

export function LiveTournamentRecoveryProvider({ children }: { children: ReactNode }) {
  const userId = useAppSelector((state) => state.auth.user?.id)
  const { data, isLoading } = useGetLiveTournamentQuery(userId ?? '', {
    skip: !userId,
    refetchOnMountOrArgChange: true,
    refetchOnReconnect: true,
  })
  const activeTournament =
    data?.hasActiveTournament && data.tournament ? data.tournament : null
  const contextValue = useMemo(
    () => ({ activeTournament, isLoading }),
    [activeTournament, isLoading],
  )

  return (
    <LiveTournamentRecoveryContext.Provider value={contextValue}>
      {activeTournament ? (
        <aside
          className="live-tournament-recovery"
          data-testid="live-tournament-recovery"
          aria-live="polite"
        >
          <div className="live-tournament-recovery__signal" aria-hidden="true" />
          <div className="live-tournament-recovery__copy">
            <span>Active live tournament</span>
            <strong>{activeTournament.title}</strong>
            <small>
              Round {activeTournament.roundNumber} · {formatPhase(activeTournament.phase)}
            </small>
          </div>
          <Link
            className="live-tournament-recovery__action"
            to={`/tournaments/${activeTournament.id}`}
          >
            Return to Live Match
          </Link>
        </aside>
      ) : null}
      {children}
    </LiveTournamentRecoveryContext.Provider>
  )
}
