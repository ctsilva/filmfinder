import { describe, expect, test } from 'vitest'
import {
  buildAlphaModel,
  computeAlphaLayout,
  dragIndex,
  firstIndex,
  indexToPosition,
  lastIndex,
  letterOf,
  letterSpans,
  positionToIndex,
  stepIndex,
  stepLetter,
} from './alphaModel.ts'

// Sorted by collation key, like people.json. Index in comments.
const NAMES = [
  '3 Idiots', // 0  #
  'Abe', // 1  A
  'Adam', // 2  A
  'Anna', // 3  A
  'Bob', // 4  B
  'Carl', // 5  C
  'Cleo', // 6  C
  'Éric', // 7  E (accent folds to e)
  'Zed', // 8  Z
]
const layout = computeAlphaLayout(NAMES)
const all = Uint8Array.from(NAMES, () => 1)
const model = buildAlphaModel(layout, all)

describe('layout', () => {
  test('letters are only those that start a name; non-letters share #', () => {
    expect(layout.letters).toEqual(['#', 'A', 'B', 'C', 'E', 'Z'])
    expect(letterOf('Éric')).toBe('E')
    expect(letterOf('3 Idiots')).toBe('#')
    expect(letterOf('Øystein')).toBe('#')
  })

  test('each name gets its letter', () => {
    expect(Array.from(layout.bucket)).toEqual([0, 1, 1, 1, 2, 3, 3, 4, 5])
  })
})

describe('model', () => {
  test('groups valid names by letter', () => {
    const only = Uint8Array.from([0, 1, 0, 1, 0, 0, 1, 0, 0]) // Abe, Anna, Cleo
    const m = buildAlphaModel(layout, only)
    expect(Array.from(m.validIdx)).toEqual([1, 3, 6])
    expect(Array.from(m.start)).toEqual([0, 0, 2, 2, 3, 3, 3])
  })

  test('puts non-letter names first even if the sort order put them elsewhere', () => {
    const names = ['Abe', 'Zed', 'Øystein'] // ø does not fold to o, so it sorts after z
    const l = computeAlphaLayout(names)
    const m = buildAlphaModel(l, Uint8Array.from([1, 1, 1]))
    expect(Array.from(m.validIdx)).toEqual([2, 0, 1])
  })
})

describe('proportional track mapping', () => {
  test('the ends of the track are the first and last valid names', () => {
    expect(positionToIndex(model, 0)).toBe(0)
    expect(positionToIndex(model, 1)).toBe(8)
  })

  test('every name takes an equal share of the track', () => {
    // 9 names: name k is at position k / 8
    for (let k = 0; k < 9; k++) expect(positionToIndex(model, k / 8)).toBe(k)
  })

  test('clamps out-of-range positions', () => {
    expect(positionToIndex(model, -5)).toBe(0)
    expect(positionToIndex(model, 5)).toBe(8)
  })

  test('a letter with many names gets a proportionally wide stretch of the track', () => {
    // 100 names: 90 start with M, 10 with X. M should take 90% of the track.
    const names = [
      ...Array.from({ length: 90 }, (_, i) => `M${String(i).padStart(2, '0')}`),
      ...Array.from({ length: 10 }, (_, i) => `X${i}`),
    ]
    const l = computeAlphaLayout(names)
    const m = buildAlphaModel(
      l,
      Uint8Array.from(names, () => 1),
    )
    const spans = letterSpans(m)
    expect(spans.map((s) => s.letter)).toEqual(['M', 'X'])
    expect(spans[0]!.to - spans[0]!.from).toBeCloseTo(0.9)
    expect(spans[1]!.to - spans[1]!.from).toBeCloseTo(0.1)
    // and the position where M ends is where X begins
    expect(letterOf(names[positionToIndex(m, 0.89)]!)).toBe('M')
    expect(letterOf(names[positionToIndex(m, 0.95)]!)).toBe('X')
  })

  test('only valid names are reachable', () => {
    const only = Uint8Array.from([0, 0, 1, 0, 0, 0, 1, 0, 0]) // Adam, Cleo
    const m = buildAlphaModel(layout, only)
    const seen = new Set<number>()
    for (let i = 0; i <= 200; i++) seen.add(positionToIndex(m, i / 200))
    expect([...seen].sort()).toEqual([2, 6])
  })

  test('letter spans follow the valid names only and leave out empty letters', () => {
    const only = Uint8Array.from([0, 1, 1, 0, 0, 0, 1, 0, 1]) // Abe, Adam, Cleo, Zed
    const m = buildAlphaModel(layout, only)
    expect(letterSpans(m)).toEqual([
      { letter: 'A', from: 0, to: 0.5 },
      { letter: 'C', from: 0.5, to: 0.75 },
      { letter: 'Z', from: 0.75, to: 1 },
    ])
  })

  test('with nothing valid there is nothing to select', () => {
    const m = buildAlphaModel(layout, new Uint8Array(NAMES.length))
    expect(positionToIndex(m, 0.5)).toBe(-1)
    expect(stepIndex(m, 0, 1)).toBe(-1)
    expect(dragIndex(m, 0, 3)).toBe(-1)
    expect(letterSpans(m)).toEqual([])
  })
})

describe('indexToPosition', () => {
  test('round-trips every valid name', () => {
    for (const mask of [all, Uint8Array.from([1, 1, 0, 1, 0, 1, 1, 0, 1])]) {
      const m = buildAlphaModel(layout, mask)
      for (const i of m.validIdx)
        expect(positionToIndex(m, indexToPosition(m, i))).toBe(i)
    }
  })

  test('is increasing in name order within a letter', () => {
    expect(indexToPosition(model, 1)).toBeLessThan(indexToPosition(model, 2))
    expect(indexToPosition(model, 2)).toBeLessThan(indexToPosition(model, 3))
  })

  test('a name that is no longer valid sits between its valid neighbours', () => {
    const m = buildAlphaModel(
      layout,
      Uint8Array.from([1, 1, 0, 1, 1, 1, 1, 1, 1]),
    ) // Adam invalid
    expect(indexToPosition(m, 2)).toBeGreaterThan(indexToPosition(m, 1))
    expect(indexToPosition(m, 2)).toBeLessThan(indexToPosition(m, 3))
  })

  test('a single valid name sits at the start', () => {
    const m = buildAlphaModel(
      layout,
      Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]),
    )
    expect(indexToPosition(m, 4)).toBe(0)
    expect(positionToIndex(m, 0.7)).toBe(4)
  })
})

describe('stepping (arrow buttons and keys)', () => {
  test('steps one valid name at a time and stops at the ends', () => {
    expect(stepIndex(model, 4, 1)).toBe(5)
    expect(stepIndex(model, 4, -1)).toBe(3)
    expect(stepIndex(model, 0, -1)).toBe(0)
    expect(stepIndex(model, 8, 1)).toBe(8)
  })

  test('skips invalid names', () => {
    const m = buildAlphaModel(
      layout,
      Uint8Array.from([1, 1, 0, 0, 1, 1, 1, 1, 1]),
    ) // Adam, Anna invalid
    expect(stepIndex(m, 1, 1)).toBe(4)
    expect(stepIndex(m, 4, -1)).toBe(1)
  })

  test('steps from a name that has become invalid', () => {
    const m = buildAlphaModel(
      layout,
      Uint8Array.from([1, 1, 0, 1, 1, 1, 1, 1, 1]),
    ) // Adam invalid
    expect(stepIndex(m, 2, 1)).toBe(3)
    expect(stepIndex(m, 2, -1)).toBe(1)
  })

  test('letter steps jump to the first name of the next or previous letter', () => {
    expect(stepLetter(model, 2, 1)).toBe(4) // A -> B
    expect(stepLetter(model, 5, -1)).toBe(4) // C -> B
    expect(stepLetter(model, 4, -1)).toBe(1) // B -> A
  })

  test('letter steps skip letters with no valid names', () => {
    const m = buildAlphaModel(
      layout,
      Uint8Array.from([1, 1, 1, 1, 0, 0, 0, 0, 1]),
    ) // only #, A, Z
    expect(stepLetter(m, 1, 1)).toBe(8)
    expect(stepLetter(m, 8, -1)).toBe(1) // Z -> A
  })

  test('first and last', () => {
    expect(firstIndex(model)).toBe(0)
    expect(lastIndex(model)).toBe(8)
  })
})

describe('fine dragging', () => {
  test('moves by whole valid names', () => {
    expect(dragIndex(model, 5, 0)).toBe(5)
    expect(dragIndex(model, 5, 2)).toBe(7)
    expect(dragIndex(model, 5, -3)).toBe(2)
  })

  test('skips invalid names', () => {
    const m = buildAlphaModel(
      layout,
      Uint8Array.from([1, 1, 0, 0, 1, 1, 1, 1, 1]),
    )
    expect(dragIndex(m, 1, 1)).toBe(4)
  })

  test('clamps at the ends', () => {
    expect(dragIndex(model, 7, 100)).toBe(8)
    expect(dragIndex(model, 1, -100)).toBe(0)
  })
})
