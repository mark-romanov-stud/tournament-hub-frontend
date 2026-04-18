import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { AuthTokens, AuthUser } from '@/features/auth/model/types'

export type BootstrapStatus = 'loading' | 'ready'

export interface AuthState {
  bootstrapStatus: BootstrapStatus
  tokens: AuthTokens | null
  user: AuthUser | null
}

export const initialAuthState: AuthState = {
  bootstrapStatus: 'loading',
  tokens: null,
  user: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,
  reducers: {
    bootstrapStarted(state) {
      state.bootstrapStatus = 'loading'
    },
    bootstrapFinished(state) {
      state.bootstrapStatus = 'ready'
    },
    tokensReceived(state, action: PayloadAction<AuthTokens>) {
      state.tokens = action.payload
    },
    userReceived(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload
    },
    sessionCleared(state) {
      state.tokens = null
      state.user = null
      state.bootstrapStatus = 'ready'
    },
  },
})

export const authReducer = authSlice.reducer
export const authActions = authSlice.actions
