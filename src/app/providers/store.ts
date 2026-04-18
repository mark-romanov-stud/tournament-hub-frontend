import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'

import { authApi } from '@/features/auth/api/auth-api'
import { authReducer } from '@/features/auth/model/auth-slice'
import { counterReducer } from '@/features/counter/model/counter-slice'

export function createAppStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      counter: counterReducer,
      [authApi.reducerPath]: authApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(authApi.middleware),
  })
}

export const store = createAppStore()

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
