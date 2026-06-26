import { type ReactNode, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAppSelector } from '@/app/providers/store'
import { useGetLiveTournamentQuery } from '@/features/auth/api/auth-api'
import { LiveTournamentRecoveryContext } from '@/features/tournaments/live/live-tournament-recovery-context'

function formatPhase(phase: string) {
  return phase.charAt(0) + phase.slice(1).toLowerCase()
}

export function LiveTournamentRecoveryProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
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
  const liveTournamentPath = activeTournament
    ? `/tournaments/${activeTournament.id}`
    : null
  const shouldShowRecoveryBanner =
    Boolean(activeTournament) && location.pathname !== liveTournamentPath

  const handleReturnToLiveMatch = () => {
    if (!activeTournament || !liveTournamentPath) {
      return
    }

    void navigate(liveTournamentPath, {
      replace: location.pathname === liveTournamentPath,
      state: { returnedToLiveMatchAt: Date.now() },
    })
  }

  return (
    <LiveTournamentRecoveryContext.Provider value={contextValue}>
      {activeTournament && shouldShowRecoveryBanner ? (
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
          <button
            className="live-tournament-recovery__action"
            type="button"
            onClick={handleReturnToLiveMatch}
          >
            Return to Live Match
          </button>
        </aside>
      ) : null}
      {children}
    </LiveTournamentRecoveryContext.Provider>
  )
}
