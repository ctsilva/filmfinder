import { describe, expect, test } from 'vitest'
import { buildPeopleIndex, type PersonRecord } from './people.ts'

const p = (
  id: string,
  name: string,
  photo: string | null = null,
): PersonRecord => ({ id, name, photo })

describe('buildPeopleIndex', () => {
  test('two different people with the same name stay two entries, each with its own films', () => {
    const { index, credits } = buildPeopleIndex([
      [p('nm1', 'Smith, John')], // film 0
      [p('nm2', 'Smith, John')], // film 1
      [p('nm1', 'Smith, John'), p('nm2', 'Smith, John')], // film 2 has both
    ])
    expect(index.names).toEqual(['Smith, John', 'Smith, John'])
    expect(index.films).toEqual([
      [0, 2],
      [1, 2],
    ])
    expect(credits).toEqual([[0], [1], [0, 1]])
  })

  test('sorted by collation key, then name, then id, so the order is stable', () => {
    const { index } = buildPeopleIndex([
      [
        p('nm9', 'Zed, A'),
        p('nm3', 'Éclair, B'),
        p('nm5', 'Adams, C'),
        p('nm2', 'Adams, C'),
      ],
    ])
    expect(index.names).toEqual(['Adams, C', 'Adams, C', 'Éclair, B', 'Zed, A'])
    // the two Adams are ordered by id: nm2 before nm5
    expect(index.films).toEqual([[0], [0], [0], [0]])
  })

  test('credits keep each film’s billing order and drop repeats', () => {
    const { index, credits } = buildPeopleIndex([
      [p('c', 'Cole, C'), p('a', 'Abe, A'), p('b', 'Bea, B'), p('a', 'Abe, A')],
    ])
    expect(index.names).toEqual(['Abe, A', 'Bea, B', 'Cole, C'])
    expect(credits[0]).toEqual([2, 0, 1])
  })

  test('a person’s photo is the first one found, and a missing photo is null', () => {
    const { index } = buildPeopleIndex([
      [p('a', 'Abe, A'), p('b', 'Bea, B')],
      [p('a', 'Abe, A', '/abe.jpg'), p('b', 'Bea, B')],
      [p('a', 'Abe, A', '/later.jpg')],
    ])
    expect(index.photos).toEqual(['/abe.jpg', null])
  })

  test('a photo belongs to one person even when another has the same name', () => {
    const { index } = buildPeopleIndex([
      [p('nm1', 'Smith, John', '/first.jpg')],
      [p('nm2', 'Smith, John')],
    ])
    expect(index.photos).toEqual(['/first.jpg', null])
  })

  test('films are listed ascending for each person', () => {
    const { index } = buildPeopleIndex([
      [p('a', 'A, A')],
      [p('b', 'B, B')],
      [p('a', 'A, A')],
    ])
    expect(index.films[0]).toEqual([0, 2])
  })

  test('no films gives empty lists', () => {
    const { index, credits } = buildPeopleIndex([])
    expect(index).toEqual({ names: [], films: [], photos: [] })
    expect(credits).toEqual([])
  })
})
