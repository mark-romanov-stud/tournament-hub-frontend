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

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_SOCKET_URL?: string
}

const getEnv = () => import.meta.env as ImportMetaEnv

function resolveSocketUrl(): string {
  const { VITE_API_URL, VITE_SOCKET_URL } = getEnv()

  if (VITE_SOCKET_URL) {
    return VITE_SOCKET_URL
  }

  if (!VITE_API_URL) {
    return 'https://tournament-hub-backend.onrender.com'
  }

  if (/^https?:\/\//.test(VITE_API_URL)) {
    return VITE_API_URL.replace(/\/api\/v1\/?$/, '')
  }

  return 'http://localhost:3000'
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
