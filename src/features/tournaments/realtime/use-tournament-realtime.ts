import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

import { useAppSelector } from '@/app/providers/store'
import { useLazyGetFullTournamentQuery } from '@/features/auth/api/tournaments-api'
import {
  tournamentClientEvents,
  type TournamentRealtimeEvent,
  tournamentServerEvents,
} from '@/features/tournaments/realtime/tournament-realtime'

export type TournamentConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'recovering'

function resolveTournamentSocketUrl() {
  const env = import.meta.env as {
    VITE_API_URL?: string
    VITE_WS_URL?: string
  }

  if (env.VITE_WS_URL) {
    return env.VITE_WS_URL
  }

  const apiUrl = env.VITE_API_URL

  if (!apiUrl || apiUrl.startsWith('/')) {
    return window.location.origin
  }

  return new URL(apiUrl).origin
}

export function useTournamentRealtime(tournamentId: string | undefined) {
  const accessToken = useAppSelector((state) => state.auth.tokens?.accessToken)
  const [recoverTournament] = useLazyGetFullTournamentQuery()
  const [connectionStatus, setConnectionStatus] =
    useState<TournamentConnectionStatus>('idle')
  const [lastEvent, setLastEvent] = useState<TournamentRealtimeEvent | null>(null)
  const [recentEvents, setRecentEvents] = useState<TournamentRealtimeEvent[]>([])
  const [lastRecoveredAt, setLastRecoveredAt] = useState<string | null>(null)
  const accessTokenRef = useRef(accessToken)
  const hasConnectedRef = useRef(false)
  const nextEventSequenceRef = useRef(1)

  useEffect(() => {
    accessTokenRef.current = accessToken
  }, [accessToken])

  useEffect(() => {
    if (!tournamentId || !accessToken) {
      return
    }

    const socket: Socket = io(resolveTournamentSocketUrl(), {
      autoConnect: false,
      auth: (callback) => {
        callback({ token: accessTokenRef.current })
      },
    })

    const joinTournamentRoom = async () => {
      const isReconnect = hasConnectedRef.current

      if (isReconnect) {
        setConnectionStatus('recovering')
      }

      socket.emit(tournamentClientEvents.join, { tournamentId })

      if (isReconnect) {
        await recoverTournament(tournamentId, false)
        setLastRecoveredAt(new Date().toLocaleTimeString())
      }

      hasConnectedRef.current = true
      setConnectionStatus('connected')
    }

    const handleConnect = () => {
      void joinTournamentRoom()
    }

    const handleDisconnect = () => {
      setConnectionStatus('disconnected')
    }

    const handleReconnectAttempt = () => {
      setConnectionStatus('connecting')
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.io.on('reconnect_attempt', handleReconnectAttempt)

    for (const eventName of tournamentServerEvents) {
      socket.on(eventName, (payload: unknown) => {
        const event = {
          name: eventName,
          payload,
          sequence: nextEventSequenceRef.current,
        }

        nextEventSequenceRef.current += 1
        setLastEvent(event)
        setRecentEvents((events) => [...events, event].slice(-50))
      })
    }

    socket.connect()

    return () => {
      socket.emit(tournamentClientEvents.leave, { tournamentId })
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.io.off('reconnect_attempt', handleReconnectAttempt)

      for (const eventName of tournamentServerEvents) {
        socket.off(eventName)
      }

      socket.disconnect()
      hasConnectedRef.current = false
      setConnectionStatus('idle')
    }
  }, [accessToken, recoverTournament, tournamentId])

  return {
    connectionStatus,
    lastRecoveredAt,
    lastEvent,
    recentEvents,
  }
}
