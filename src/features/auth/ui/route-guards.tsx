import { type ReactElement, useEffect } from 'react'
import { Navigate } from 'react-router-dom'

import { useAppDispatch, useAppSelector } from '@/app/providers/store'
import { useLazyGetProfileQuery } from '@/features/auth/api/auth-api'
import { authActions } from '@/features/auth/model/auth-slice'
import {
  clearStoredSession,
  loadStoredSession,
} from '@/features/auth/model/token-storage'

function SessionGate() {
  return (
    <main className="session-gate">
      <div className="session-gate__pulse" />
      <p className="session-gate__copy">Restoring your session...</p>
    </main>
  )
}

function useRestoreSession() {
  const dispatch = useAppDispatch()
  const { bootstrapStatus, tokens, user } = useAppSelector((state) => state.auth)

  const [getProfile] = useLazyGetProfileQuery()

  useEffect(() => {
    async function restoreSession() {
      if (bootstrapStatus === 'ready') {
        return
      }

      const storedTokens = tokens ?? loadStoredSession()

      if (!storedTokens?.accessToken) {
        clearStoredSession()
        dispatch(authActions.sessionCleared())
        return
      }

      dispatch(authActions.tokensReceived(storedTokens))

      try {
        const profile = await getProfile().unwrap()
        dispatch(authActions.userReceived(profile))
        dispatch(authActions.bootstrapFinished())
      } catch {
        clearStoredSession()
        dispatch(authActions.sessionCleared())
      }
    }

    void restoreSession()
  }, [bootstrapStatus, dispatch, getProfile, tokens])

  return {
    bootstrapStatus,
    tokens,
    user,
  }
}

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { bootstrapStatus, tokens, user } = useRestoreSession()

  if (bootstrapStatus === 'loading') {
    return <SessionGate />
  }

  if (!tokens?.accessToken || !user) {
    return <Navigate replace to="/login" />
  }

  return children
}

export function GuestRoute({ children }: { children: ReactElement }) {
  const { bootstrapStatus, tokens, user } = useRestoreSession()

  if (bootstrapStatus === 'loading') {
    return <SessionGate />
  }

  if (tokens?.accessToken && user) {
    return <Navigate replace to="/" />
  }

  return children
}
