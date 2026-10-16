import { expect, test } from 'vitest'
import { firstResults } from './results.ts'

test('returns the first matching films in order, up to the limit', () => {
  const mask = Uint8Array.from([0, 1, 1, 0, 1, 1, 1])
  expect(firstResults(mask, 3)).toEqual([1, 2, 4])
  expect(firstResults(mask, 100)).toEqual([1, 2, 4, 5, 6])
})

test('nothing matches, or a limit of zero', () => {
  expect(firstResults(new Uint8Array(5), 10)).toEqual([])
  expect(firstResults(Uint8Array.from([1, 1]), 0)).toEqual([])
})
