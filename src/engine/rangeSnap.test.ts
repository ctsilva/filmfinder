import { describe, expect, test } from 'vitest'
import {
  allowedPositions,
  rangeHasFilm,
  snapMax,
  snapMin,
} from './rangeSnap.ts'
import { makeRng } from './synthetic.ts'

const LO = 1920
const HI = 2025

describe('allowedPositions', () => {
  test('folds values beyond the ends onto the end stops and removes repeats', () => {
    expect(
      allowedPositions([1906, 1915, 1950, 1950, 2026, 2030], LO, HI),
    ).toEqual([1920, 1950, 2025])
  })
})

describe('the critique’s examples', () => {
  const allowed = allowedPositions([1980, 1981, 1985, 1990], LO, HI) // other filters leave 1980-1990

  test('the lower thumb cannot be dragged past the last year that has films', () => {
    // thumbs sit at the full range; dragging the lower one to 2000 would give no films
    const [min, max] = snapMin(allowed, 2000, [LO, HI])
    expect([min, max]).toEqual([1990, HI])
    expect(rangeHasFilm([1980, 1981, 1985, 1990], LO, HI, [min, max])).toBe(
      true,
    )
  })

  test('the upper thumb cannot be dragged below the first year that has films', () => {
    const [min, max] = snapMax(allowed, 1950, [LO, HI])
    expect([min, max]).toEqual([LO, 1980])
    expect(rangeHasFilm([1980, 1981, 1985, 1990], LO, HI, [min, max])).toBe(
      true,
    )
  })

  test('a gap between two years that have films cannot be selected', () => {
    const gap = allowedPositions([1980, 1990], LO, HI)
    // lower thumb dragged to 1985 lands on a real year, never between them
    expect(snapMin(gap, 1985, [LO, HI])[0]).toBe(1980)
    expect(snapMin(gap, 1987, [LO, HI])[0]).toBe(1990)
    // with both thumbs on real years the range always contains a film
    expect(rangeHasFilm([1980, 1990], LO, HI, [1980, 1990])).toBe(true)
  })
})

describe('snapping near the other thumb', () => {
  const allowed = [1950, 1960, 1970, 1980]

  test('the lower thumb stops at the upper thumb', () => {
    expect(snapMin(allowed, 1980, [1950, 1960])).toEqual([1960, 1960])
  })

  test('the upper thumb stops at the lower thumb', () => {
    expect(snapMax(allowed, 1950, [1970, 1980])).toEqual([1970, 1970])
  })

  test('with no films at all the thumbs still move freely', () => {
    expect(snapMin([], 1990, [1950, 2000])).toEqual([1990, 2000])
    expect(snapMax([], 1900, [1950, 2000])).toEqual([1950, 1950])
  })

  test('a stale upper thumb below every available value moves both thumbs', () => {
    expect(snapMin([1990, 2000], 1995, [1930, 1940])).toEqual([1990, 1990])
  })
})

describe('rangeHasFilm', () => {
  test('end stops mean no limit', () => {
    expect(rangeHasFilm([1906], LO, HI, [LO, 1950])).toBe(true) // 1906 is below the lower end stop
    expect(rangeHasFilm([2026], LO, HI, [2000, HI])).toBe(true)
    expect(rangeHasFilm([1906], LO, HI, [1930, 1950])).toBe(false)
  })
})

describe('property: moving a thumb never gives an empty range', () => {
  test('random present sets and random moves', () => {
    const rng = makeRng(99)
    const int = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1))
    for (let trial = 0; trial < 500; trial++) {
      const present = Array.from({ length: int(1, 12) }, () => int(1900, 2030))
      const allowed = allowedPositions(present, LO, HI)
      // start from any valid state: both thumbs on allowed positions, lower <= upper
      const a = allowed[int(0, allowed.length - 1)]!
      const b = allowed[int(0, allowed.length - 1)]!
      let range: [number, number] = [Math.min(a, b), Math.max(a, b)]
      for (let move = 0; move < 20; move++) {
        const target = int(LO, HI)
        range =
          rng() < 0.5
            ? snapMin(allowed, target, range)
            : snapMax(allowed, target, range)
        expect(range[0]).toBeLessThanOrEqual(range[1])
        expect(rangeHasFilm(present, LO, HI, range)).toBe(true)
      }
    }
  })
})
