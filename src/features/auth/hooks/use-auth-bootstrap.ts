import { useEffect, useRef } from 'react'

import { useAppDispatch } from '@/app/providers/store'
import { useLazyGetProfileQuery } from '@/features/auth/api/auth-api'
import { authActions } from '@/features/auth/model/auth-slice'
import {
  clearStoredSession,
  loadStoredSession,
} from '@/features/auth/model/token-storage'

export function useAuthBootstrap() {
  const dispatch = useAppDispatch()
  const [getProfile] = useLazyGetProfileQuery()
  const hasBootstrappedRef = useRef(false)

  useEffect(() => {
    if (hasBootstrappedRef.current) {
      return
    }

    hasBootstrappedRef.current = true

    const bootstrapAuth = async () => {
      dispatch(authActions.bootstrapStarted())

      const storedSession = loadStoredSession()

      if (!storedSession) {
        dispatch(authActions.sessionCleared())
        dispatch(authActions.bootstrapFinished())
        return
      }

      dispatch(authActions.tokensReceived(storedSession))

      try {
        const user = await getProfile().unwrap()
        dispatch(authActions.userReceived(user))
      } catch {
        clearStoredSession()
        dispatch(authActions.sessionCleared())
      } finally {
        dispatch(authActions.bootstrapFinished())
      }
    }

    void bootstrapAuth()
  }, [dispatch, getProfile])
}
