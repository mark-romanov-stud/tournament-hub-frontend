import { describe, expect, it } from 'vitest'

import {
  counterReducer,
  decrement,
  increment,
  incrementByAmount,
} from '@/features/counter/model/counter-slice'

describe('counterSlice', () => {
  it('increments and decrements predictably', () => {
    const incremented = counterReducer({ value: 0 }, increment())
    const decremented = counterReducer(incremented, decrement())

    expect(incremented.value).toBe(1)
    expect(decremented.value).toBe(0)
  })

  it('adds a custom amount', () => {
    const state = counterReducer({ value: 12 }, incrementByAmount(5))

    expect(state.value).toBe(17)
  })
})
