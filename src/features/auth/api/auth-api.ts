import {
  type BaseQueryFn,
  createApi,
  type FetchArgs,
  fetchBaseQuery,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react'

import { authActions } from '@/features/auth/model/auth-slice'
import {
  clearStoredSession,
  loadStoredSession,
  persistTokens,
} from '@/features/auth/model/token-storage'
import type {
  ApiResponse,
  AuthTokens,
  AuthUser,
  LoginInput,
  RegisterInput,
} from '@/features/auth/model/types'

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'https://tournament-hub-backend.onrender.com/api/v1'

interface AuthStateShape {
  auth: {
    tokens: AuthTokens | null
  }
}

function getRequestUrl(args: string | FetchArgs) {
  return typeof args === 'string' ? args : args.url
}

function isRefreshRequest(args: string | FetchArgs) {
  return getRequestUrl(args).includes('/auth/refresh')
}

function isPublicAuthRequest(args: string | FetchArgs) {
  const url = getRequestUrl(args)

  return url.includes('/auth/login') || url.includes('/auth/register')
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers, api) => {
    const state = api.getState() as AuthStateShape
    const accessToken = state.auth.tokens?.accessToken

    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }

    headers.set('Content-Type', 'application/json')

    return headers
  },
})

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions)

  if (
    result.error?.status === 401 &&
    !isRefreshRequest(args) &&
    !isPublicAuthRequest(args)
  ) {
    const state = api.getState() as AuthStateShape
    const refreshToken =
      state.auth.tokens?.refreshToken ?? loadStoredSession()?.refreshToken

    if (!refreshToken) {
      clearStoredSession()
      api.dispatch(authActions.sessionCleared())

      return result
    }

    const refreshResult = await rawBaseQuery(
      {
        url: '/auth/refresh',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
        body: { refreshToken },
      },
      api,
      extraOptions,
    )

    if (refreshResult.data) {
      const refreshResponse = refreshResult.data as ApiResponse<AuthTokens>

      if (refreshResponse.data) {
        persistTokens(refreshResponse.data)
        api.dispatch(authActions.tokensReceived(refreshResponse.data))
        result = await rawBaseQuery(args, api, extraOptions)
      }
    }

    if (refreshResult.error || !refreshResult.data) {
      clearStoredSession()
      api.dispatch(authActions.sessionCleared())
    }
  }

  return result
}

function unwrapResponseData<T>(response: ApiResponse<T>) {
  if (response.data === null) {
    throw new Error('Expected response data')
  }

  return response.data
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    register: builder.mutation<AuthTokens, RegisterInput>({
      query: (body) => ({
        url: '/auth/register',
        method: 'POST',
        body,
      }),
      transformResponse: unwrapResponseData,
    }),
    login: builder.mutation<AuthTokens, LoginInput>({
      query: (body) => ({
        url: '/auth/login',
        method: 'POST',
        body,
      }),
      transformResponse: unwrapResponseData,
    }),
    refresh: builder.mutation<AuthTokens, { refreshToken: string }>({
      query: ({ refreshToken }) => ({
        url: '/auth/refresh',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
        body: { refreshToken },
      }),
      transformResponse: unwrapResponseData,
    }),
    getProfile: builder.query<AuthUser, void>({
      query: () => ({
        url: '/users/profile',
        method: 'GET',
      }),
      transformResponse: unwrapResponseData,
    }),
    logout: builder.mutation<boolean, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'DELETE',
      }),
      transformResponse: unwrapResponseData,
    }),
  }),
})

export const {
  useGetProfileQuery,
  useLazyGetProfileQuery,
  useLoginMutation,
  useLogoutMutation,
  useRefreshMutation,
  useRegisterMutation,
} = authApi
