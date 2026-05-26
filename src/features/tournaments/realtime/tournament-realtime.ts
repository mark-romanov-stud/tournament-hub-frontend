export const tournamentClientEvents = {
  join: 'tournament:join',
  leave: 'tournament:leave',
} as const

export const tournamentServerEvents = [
  'tournament:participant_joined',
  'tournament:participant_left',
  'tournament:started',
  'round:created',
  'round:phase_changed',
  'tournament:presence_updated',
  'round:progress_updated',
  'voting:submission_revealed',
  'vote:progress_updated',
  'vote:finalized',
  'round:completed',
  'tournament:finished',
  'tournament:cancelled',
] as const

export type TournamentServerEventName = (typeof tournamentServerEvents)[number]

export interface TournamentRealtimeEvent {
  name: TournamentServerEventName
  payload: unknown
}
