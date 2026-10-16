import { describe, expect, test } from 'vitest'
import { logTicks } from './drawStarfield.ts'

describe('logTicks', () => {
  test('uses 1, 2 and 5 times a power of ten across several decades', () => {
    expect(logTicks([900, 3_500_000])).toEqual([
      1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000,
      2000000,
    ])
  })

  test('a narrow range of small counts still gets ticks', () => {
    const ticks = logTicks([25, 170])
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(ticks.every((t) => t >= 25 && t <= 170)).toBe(true)
  })

  test('falls back to every digit when 1-2-5 gives too few ticks', () => {
    expect(logTicks([30, 90])).toEqual([30, 40, 50, 60, 70, 80, 90])
  })
})
