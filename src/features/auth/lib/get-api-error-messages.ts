import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

import type { ApiResponse } from '@/features/auth/model/types'

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'message' in value && Array.isArray(value.message)
}

export function getApiErrorMessages(error: unknown): string[] {
  if (error && typeof error === 'object' && 'data' in error) {
    const fetchError = error as FetchBaseQueryError & { data?: unknown }

    if (isApiResponse(fetchError.data)) {
      return fetchError.data.message
    }
  }

  return ['Something went wrong. Please try again.']
}
