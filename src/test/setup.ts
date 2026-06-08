import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { resetMockAuthState } from '@/test/handlers'
import { server } from '@/test/server'

const NativeRequest = globalThis.Request

globalThis.Request = class TestRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    try {
      super(input, init)
    } catch (error) {
      if (
        init?.signal &&
        error instanceof TypeError &&
        error.message.includes('Expected signal')
      ) {
        const requestInit = { ...init }
        delete requestInit.signal

        super(input, requestInit)
        return
      }

      throw error
    }
  }
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetMockAuthState()
  sessionStorage.clear()
})

afterAll(() => {
  server.close()
})
