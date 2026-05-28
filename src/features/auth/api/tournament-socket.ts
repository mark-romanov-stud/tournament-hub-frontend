import { io, type Socket } from 'socket.io-client'

import { loadStoredSession } from '@/features/auth/model/token-storage'

export const TournamentClientEvent = {
  JOIN: 'tournament:join',
  LEAVE: 'tournament:leave',
} as const

export const TournamentServerEvent = {
  PARTICIPANT_JOINED: 'tournament:participant_joined',
  PARTICIPANT_LEFT: 'tournament:participant_left',
  PRESENCE_UPDATED: 'tournament:presence_updated',
} as const

function resolveSocketUrl() {
  const configuredApiUrl = import.meta.env.VITE_API_URL

  if (!configuredApiUrl) {
    return 'https://tournament-hub-backend.onrender.com'
  }

  if (/^https?:\/\//.test(configuredApiUrl)) {
    return configuredApiUrl.replace(/\/api\/v1\/?$/, '')
  }

  return window.location.origin
}

export function createTournamentSocket(): Socket {
  const accessToken = loadStoredSession()?.accessToken

  return io(resolveSocketUrl(), {
    transports: ['websocket'],
    auth: {
      token: accessToken,
    },
  })
}
