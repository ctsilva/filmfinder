import { describe, expect, test } from 'vitest'
import { lastFirst, titleSortForm } from './names.ts'

describe('lastFirst', () => {
  test.each([
    ['Ingmar Bergman', 'Bergman, Ingmar'],
    ['Max von Sydow', 'von Sydow, Max'],
    ['Ludwig van Beethoven', 'van Beethoven, Ludwig'],
    ['Robert Downey Jr.', 'Downey, Robert Jr.'],
    ['Martin Luther King Jr.', 'King, Martin Luther Jr.'],
    ['Philip Seymour Hoffman', 'Hoffman, Philip Seymour'],
    ['Cher', 'Cher'],
    ['Bergman, Ingmar', 'Bergman, Ingmar'],
    ["Peter O'Toole", "O'Toole, Peter"],
  ])('%s -> %s', (input, expected) => {
    expect(lastFirst(input)).toBe(expected)
  })
})

describe('titleSortForm', () => {
  test.each([
    ['The Magician', 'Magician, The'],
    ['A Lesson in Love', 'Lesson in Love, A'],
    ['An Autumn Sonata', 'Autumn Sonata, An'],
    ['Theatre of Blood', 'Theatre of Blood'],
    ['Anna Karenina', 'Anna Karenina'],
    ['The', 'The'],
    ['Autumn Sonata', 'Autumn Sonata'],
  ])('%s -> %s', (input, expected) => {
    expect(titleSortForm(input)).toBe(expected)
  })
})
