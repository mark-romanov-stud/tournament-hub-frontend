import { createContext, useContext } from 'react'

import type { LiveTournamentSummary } from '@/features/auth/api/auth-api'

export interface LiveTournamentRecoveryContextValue {
  activeTournament: LiveTournamentSummary | null
  isLoading: boolean
}

export const LiveTournamentRecoveryContext =
  createContext<LiveTournamentRecoveryContextValue>({
    activeTournament: null,
    isLoading: false,
  })

export function useLiveTournamentRecovery() {
  return useContext(LiveTournamentRecoveryContext)
}
