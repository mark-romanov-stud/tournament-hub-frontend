import { useNavigate } from 'react-router-dom'

import { useAppDispatch } from '@/app/providers/store'
import { useLazyGetProfileQuery } from '@/features/auth/api/auth-api'
import { authActions } from '@/features/auth/model/auth-slice'
import { clearStoredSession, persistTokens } from '@/features/auth/model/token-storage'
import type { AuthTokens } from '@/features/auth/model/types'

export function useCompleteAuthentication() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [getProfile] = useLazyGetProfileQuery()

  return async (tokens: AuthTokens) => {
    persistTokens(tokens)
    dispatch(authActions.tokensReceived(tokens))

    try {
      const user = await getProfile().unwrap()

      dispatch(authActions.userReceived(user))
      void navigate('/', { replace: true })
    } catch (error) {
      clearStoredSession()
      dispatch(authActions.sessionCleared())
      throw error
    }
  }
}
