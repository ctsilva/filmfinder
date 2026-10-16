import { describe, expect, test } from 'vitest'
import { computeLayout } from './layout.ts'
import { FilmStore } from './store.ts'
import { syntheticFilms } from './synthetic.ts'

function store() {
  const file = syntheticFilms(3000, 5)
  // small whole-number popularity, like Wikipedia editions
  file.votes = file.votes.map((_, i) => 30 + (i % 20))
  return { file, store: new FilmStore(file) }
}

describe('computeLayout', () => {
  test('rating axis spreads stars within +-0.05 of the rating', () => {
    const { store: s } = store()
    const { ys } = computeLayout(s, 'rating')
    for (let i = 0; i < s.count; i++) {
      expect(Math.abs(ys[i]! - s.rating10[i]! / 10)).toBeLessThanOrEqual(0.0501)
    }
  })

  test('popularity axis spreads whole-number counts within +-0.5', () => {
    const { store: s } = store()
    const { ys } = computeLayout(s, 'votes')
    for (let i = 0; i < s.count; i++) {
      expect(Math.abs(ys[i]! - s.votes[i]!)).toBeLessThanOrEqual(0.5)
    }
  })

  test('films with the same popularity no longer share one exact height', () => {
    const { store: s } = store()
    const { ys } = computeLayout(s, 'votes')
    const heights = new Set<number>()
    for (let i = 0; i < s.count; i++) if (s.votes[i] === 30) heights.add(ys[i]!)
    expect(heights.size).toBeGreaterThan(100) // 150 films at count 30, nearly all distinct
  })

  test('the x position stays within the film’s year', () => {
    const { store: s } = store()
    const { xs } = computeLayout(s, 'votes')
    for (let i = 0; i < s.count; i++) {
      expect(xs[i]!).toBeGreaterThanOrEqual(s.year[i]!)
      expect(xs[i]!).toBeLessThan(s.year[i]! + 1)
    }
  })

  test('layout is deterministic', () => {
    const { store: s } = store()
    expect(Array.from(computeLayout(s, 'votes').ys)).toEqual(
      Array.from(computeLayout(s, 'votes').ys),
    )
  })
})
