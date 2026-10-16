import { describe, expect, test } from 'vitest'
import { placeCard } from './cardPlacement.ts'

const container = { w: 800, h: 600 }
const card = { w: 300, h: 200 }

describe('placeCard', () => {
  test('goes right of and below the star when there is room', () => {
    expect(placeCard({ x: 100, y: 100 }, container, card)).toEqual({
      x: 114,
      y: 114,
    })
  })

  test('flips to the left near the right edge', () => {
    expect(placeCard({ x: 700, y: 100 }, container, card)).toEqual({
      x: 386,
      y: 114,
    })
  })

  test('flips above near the bottom edge', () => {
    expect(placeCard({ x: 100, y: 550 }, container, card)).toEqual({
      x: 114,
      y: 336,
    })
  })

  test('flips in both directions in the bottom-right corner', () => {
    expect(placeCard({ x: 790, y: 590 }, container, card)).toEqual({
      x: 476,
      y: 376,
    })
  })

  test('stays inside the container when flipping would overflow the other side', () => {
    const tight = { w: 320, h: 220 }
    const p = placeCard({ x: 160, y: 110 }, tight, card)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.y).toBeGreaterThanOrEqual(0)
    expect(p.x + card.w).toBeLessThanOrEqual(tight.w)
    expect(p.y + card.h).toBeLessThanOrEqual(tight.h)
  })
})
