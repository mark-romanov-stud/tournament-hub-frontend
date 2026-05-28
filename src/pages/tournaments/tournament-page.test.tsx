import { act, screen, waitFor } from '@testing-library/react'
import { io } from 'socket.io-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderApp } from '@/app/test/render-app'
import { persistTokens } from '@/features/auth/model/token-storage'
import {
  DEFAULT_AUTH_STATE,
  DEFAULT_TOURNAMENT_STATE,
  getFullTournamentRequestCount,
  resetMockAuthState,
} from '@/test/handlers'

type Listener = (...args: unknown[]) => void
type AuthCallback = (payload: object) => void
type SocketAuth = (callback: AuthCallback) => void

class FakeEmitter {
  handlers = new Map<string, Listener[]>()

  on(eventName: string, listener: Listener) {
    const listeners = this.handlers.get(eventName) ?? []
    listeners.push(listener)
    this.handlers.set(eventName, listeners)
    return this
  }

  off(eventName: string, listener?: Listener) {
    if (!listener) {
      this.handlers.delete(eventName)
      return this
    }

    this.handlers.set(
      eventName,
      (this.handlers.get(eventName) ?? []).filter(
        (registeredListener) => registeredListener !== listener,
      ),
    )
    return this
  }

  trigger(eventName: string, payload?: unknown) {
    for (const listener of this.handlers.get(eventName) ?? []) {
      listener(payload)
    }
  }

  listenerCount() {
    return Array.from(this.handlers.values()).reduce(
      (count, listeners) => count + listeners.length,
      0,
    )
  }
}

class FakeSocket extends FakeEmitter {
  io = new FakeEmitter()
  emitted: { eventName: string; payload: unknown }[] = []
  disconnectCount = 0

  emit(eventName: string, payload: unknown) {
    this.emitted.push({ eventName, payload })
    return this
  }

  connect() {
    this.trigger('connect')
    return this
  }

  disconnect() {
    this.disconnectCount += 1
    return this
  }

  totalListenerCount() {
    return this.listenerCount() + this.io.listenerCount()
  }
}

const fakeSocket = new FakeSocket()
const mockedIo = vi.mocked(io)

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}))

describe('TournamentPage realtime flow', () => {
  beforeEach(() => {
    resetMockAuthState()
    sessionStorage.clear()
    fakeSocket.handlers.clear()
    fakeSocket.io.handlers.clear()
    fakeSocket.emitted = []
    fakeSocket.disconnectCount = 0
    mockedIo.mockClear()
    persistTokens({
      accessToken: DEFAULT_AUTH_STATE.accessToken,
      refreshToken: DEFAULT_AUTH_STATE.refreshToken,
    })
  })

  it('joins the tournament room, receives events, recovers after reconnect, and leaves on exit', async () => {
    const { unmount } = renderApp([`/tournaments/${DEFAULT_TOURNAMENT_STATE.id}`])

    expect(
      await screen.findByRole('heading', { name: /tournament created/i }),
    ).toBeVisible()
    await waitFor(() => {
      expect(screen.getByTestId('tournament-realtime-status')).toHaveTextContent(
        'Connected',
      )
    })
    expect(screen.getByText(DEFAULT_AUTH_STATE.user.id)).toBeVisible()
    expect(fakeSocket.emitted).toContainEqual({
      eventName: 'tournament:join',
      payload: { tournamentId: DEFAULT_TOURNAMENT_STATE.id },
    })
    const socketOptions = mockedIo.mock.calls.at(0)?.[1]
    const authPayload = await new Promise<unknown>((resolve) => {
      const auth = socketOptions?.auth as SocketAuth | undefined

      auth?.((payload: object) => {
        resolve(payload)
      })
    })
    expect(authPayload).toEqual({ token: DEFAULT_AUTH_STATE.accessToken })
    expect(getFullTournamentRequestCount()).toBe(1)

    act(() => {
      fakeSocket.trigger('tournament:started', {
        tournamentId: DEFAULT_TOURNAMENT_STATE.id,
      })
    })

    expect(await screen.findByTestId('tournament-latest-event')).toHaveTextContent(
      'tournament:started',
    )

    act(() => {
      fakeSocket.trigger('disconnect')
    })
    expect(screen.getByTestId('tournament-realtime-status')).toHaveTextContent(
      'Disconnected',
    )

    act(() => {
      fakeSocket.trigger('connect')
    })

    await waitFor(() => {
      expect(getFullTournamentRequestCount()).toBe(2)
    })
    expect(screen.getByTestId('tournament-recovery-note')).toHaveTextContent(
      /state recovered after reconnect/i,
    )

    unmount()

    expect(fakeSocket.emitted).toContainEqual({
      eventName: 'tournament:leave',
      payload: { tournamentId: DEFAULT_TOURNAMENT_STATE.id },
    })
    expect(fakeSocket.disconnectCount).toBe(1)
    expect(fakeSocket.totalListenerCount()).toBe(0)
  })
})
