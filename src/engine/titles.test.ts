import { expect, test } from 'vitest'
import { buildTitleIndex } from './titles.ts'

test('titles are grouped, sorted ignoring case and accents, and point to film indexes', () => {
  const index = buildTitleIndex({
    title: ['b movie', 'Zorro', 'Alpha', 'Éclair', 'Alpha'],
  })
  expect(index.names).toEqual(['Alpha', 'b movie', 'Éclair', 'Zorro'])
  expect(index.films).toEqual([[2, 4], [0], [3], [1]])
})

test('a leading article moves to the end, so "The Magician" files under M', () => {
  const index = buildTitleIndex({
    title: ['The Magician', 'A Lesson in Love', 'Zorro'],
  })
  expect(index.names).toEqual(['Lesson in Love, A', 'Magician, The', 'Zorro'])
  expect(index.films).toEqual([[1], [0], [2]])
})
