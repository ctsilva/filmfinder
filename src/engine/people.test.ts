import { describe, expect, test } from 'vitest'
import { personLabels } from './people.ts'

const titles = ['Alpha', 'Beta', 'Gamma']

describe('personLabels', () => {
  test('unique names stay as they are', () => {
    const labels = personLabels(
      { names: ['Abe, A', 'Bea, B'], films: [[0], [1]] },
      titles,
    )
    expect(labels).toEqual(['Abe, A', 'Bea, B'])
  })

  test('namesakes get their best-known film so they can be told apart', () => {
    const index = {
      names: ['Abe, A', 'Smith, John', 'Smith, John', 'Zed, Z'],
      films: [[0], [2, 1], [0, 2], [1]],
    }
    expect(personLabels(index, titles)).toEqual([
      'Abe, A',
      'Smith, John · Gamma', // best-known film is the one with the lowest index among their films
      'Smith, John · Alpha',
      'Zed, Z',
    ])
  })

  test('namesakes who share their best-known film are numbered', () => {
    const index = {
      names: ['Smith, John', 'Smith, John'],
      films: [[0], [0, 1]],
    }
    expect(personLabels(index, titles)).toEqual([
      'Smith, John · Alpha',
      'Smith, John · Alpha (2)',
    ])
  })

  test('three namesakes', () => {
    const index = { names: ['X, Y', 'X, Y', 'X, Y'], films: [[0], [1], [2]] }
    expect(personLabels(index, titles)).toEqual([
      'X, Y · Alpha',
      'X, Y · Beta',
      'X, Y · Gamma',
    ])
  })

  test('does not change the input', () => {
    const index = { names: ['X, Y', 'X, Y'], films: [[0], [1]] }
    personLabels(index, titles)
    expect(index.names).toEqual(['X, Y', 'X, Y'])
  })
})
