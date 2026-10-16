import { describe, expect, test } from 'vitest'
import { QueryEngine } from '../engine/engine.ts'
import { syntheticFilms } from '../engine/synthetic.ts'
import { FilmStore } from '../engine/store.ts'
import {
  addQueryFilters,
  ALL_CERTS,
  ALL_GENRES,
  applyQuery,
  INITIAL_QUERY,
  LENGTH_HI,
  LENGTH_LO,
  personQuery,
  YEAR_HI,
  YEAR_LO,
} from './queryState.ts'

function setup() {
  const file = syntheticFilms(2000, 3)
  const store = new FilmStore(file)
  const engine = new QueryEngine(store)
  addQueryFilters(engine, store)
  return { file, store, engine }
}

describe('applyQuery', () => {
  test('initial state filters nothing', () => {
    const { engine } = setup()
    applyQuery(engine, INITIAL_QUERY)
    expect(engine.count).toBe(2000)
  })

  test('length range is inclusive', () => {
    const { engine, file } = setup()
    applyQuery(engine, { ...INITIAL_QUERY, length: [100, 120] })
    const expected = file.length.filter((l) => l >= 100 && l <= 120).length
    expect(engine.count).toBe(expected)
  })

  test('thumbs at the end stops mean no limit', () => {
    const { engine, file } = setup()
    applyQuery(engine, { ...INITIAL_QUERY, length: [LENGTH_LO, 100] })
    expect(engine.count).toBe(file.length.filter((l) => l <= 100).length)
    applyQuery(engine, { ...INITIAL_QUERY, length: [200, LENGTH_HI] })
    expect(engine.count).toBe(file.length.filter((l) => l >= 200).length)
    applyQuery(engine, { ...INITIAL_QUERY, length: [LENGTH_LO, LENGTH_HI] })
    expect(engine.count).toBe(2000)
  })

  test('cert checkboxes keep only checked certifications', () => {
    const { engine, file } = setup()
    applyQuery(engine, { ...INITIAL_QUERY, certs: 0b00101 }) // G and PG-13
    expect(engine.count).toBe(
      file.cert.filter((c) => c === 0 || c === 2).length,
    )
    applyQuery(engine, { ...INITIAL_QUERY, certs: ALL_CERTS })
    expect(engine.count).toBe(2000)
  })

  test('genre toggles show exactly the films coloured by an enabled genre', () => {
    const { engine, file, store } = setup()
    const enabled = (1 << 0) | (1 << 3)
    applyQuery(engine, { ...INITIAL_QUERY, genres: enabled })
    expect(engine.count).toBe(
      file.primaryGenre.filter((g) => ((1 << g) & enabled) !== 0).length,
    )
    // every film still shown is drawn in one of the enabled genres' colours
    for (let i = 0; i < store.count; i++) {
      if (engine.resultMask[i]) expect([0, 3]).toContain(store.primaryGenre[i])
    }
    applyQuery(engine, { ...INITIAL_QUERY, genres: ALL_GENRES })
    expect(engine.count).toBe(2000)
  })

  test('with only one genre enabled, no star of another colour remains', () => {
    const { engine, store } = setup()
    for (let only = 0; only < 10; only++) {
      applyQuery(engine, { ...INITIAL_QUERY, genres: 1 << only })
      for (let i = 0; i < store.count; i++) {
        if (engine.resultMask[i]) expect(store.primaryGenre[i]).toBe(only)
      }
    }
  })

  test('a widget’s valid values ignore its own setting', () => {
    const { engine, store } = setup()
    applyQuery(engine, { ...INITIAL_QUERY, certs: 0b00001, length: [100, 110] })
    // cert widget: valid certs come from the length filter alone, so more than just G
    const seen = engine.validBits('cert', store.certBit)
    expect(seen.toString(2).split('1').length - 1).toBeGreaterThan(1)
  })
})

describe('alphaslider filters', () => {
  test('a selected name limits the result to that name’s films', () => {
    const { engine } = setup()
    const index = { names: ['A', 'B'], films: [[1, 5, 9], [2]] }
    applyQuery(
      engine,
      { ...INITIAL_QUERY, alpha: { ...INITIAL_QUERY.alpha, actor: 0 } },
      { actor: index },
    )
    expect(engine.count).toBe(3)
    expect([1, 5, 9].every((i) => engine.resultMask[i] === 1)).toBe(true)
  })

  test('ALL (null) clears the filter, and so does a list that has not loaded yet', () => {
    const { engine } = setup()
    applyQuery(
      engine,
      { ...INITIAL_QUERY, alpha: { ...INITIAL_QUERY.alpha, actor: 0 } },
      {},
    )
    expect(engine.count).toBe(2000)
  })

  test('alphasliders combine with each other and with other widgets', () => {
    const { engine } = setup()
    const actor = { names: ['A'], films: [[1, 2, 3, 4]] }
    const director = { names: ['D'], films: [[3, 4, 5, 6]] }
    applyQuery(
      engine,
      {
        ...INITIAL_QUERY,
        alpha: { ...INITIAL_QUERY.alpha, actor: 0, director: 0 },
      },
      { actor, director },
    )
    expect(engine.count).toBe(2) // films 3 and 4
  })

  test('tight coupling: an alphaslider’s valid names ignore its own selection', () => {
    const { engine } = setup()
    const actor = {
      names: ['A', 'B'],
      films: [
        [1, 2],
        [100, 101],
      ],
    }
    const director = { names: ['D'], films: [[1, 2, 3]] }
    applyQuery(
      engine,
      {
        ...INITIAL_QUERY,
        alpha: { ...INITIAL_QUERY.alpha, actor: 0, director: 0 },
      },
      { actor, director },
    )
    // Actor B has no films with director D, so it is not valid; A is valid even though selected
    expect(Array.from(engine.validNames('actor', actor.films))).toEqual([1, 0])
  })
})

describe('year filter', () => {
  test('keeps films released in the inclusive range', () => {
    const { engine, file } = setup()
    applyQuery(engine, { ...INITIAL_QUERY, year: [1950, 1979] })
    expect(engine.count).toBe(
      file.year.filter((y) => y >= 1950 && y <= 1979).length,
    )
    expect(engine.count).toBeGreaterThan(0)
  })

  test('thumbs at the end stops mean no limit', () => {
    const { engine, file } = setup()
    applyQuery(engine, { ...INITIAL_QUERY, year: [YEAR_LO, 1960] })
    expect(engine.count).toBe(file.year.filter((y) => y <= 1960).length)
    applyQuery(engine, { ...INITIAL_QUERY, year: [2000, YEAR_HI] })
    expect(engine.count).toBe(file.year.filter((y) => y >= 2000).length)
    applyQuery(engine, { ...INITIAL_QUERY, year: [YEAR_LO, YEAR_HI] })
    expect(engine.count).toBe(2000)
  })

  test('combines with length and narrows the other widgets valid values', () => {
    const { engine, file, store } = setup()
    applyQuery(engine, {
      ...INITIAL_QUERY,
      year: [1950, 1979],
      length: [100, 120],
    })
    const expected = file.year.filter(
      (y, i) =>
        y >= 1950 &&
        y <= 1979 &&
        file.length[i]! >= 100 &&
        file.length[i]! <= 120,
    ).length
    expect(engine.count).toBe(expected)
    // length's valid range ignores its own filter but respects the year filter
    const valid = engine.validRange('length', store.length)!
    expect(valid.max).toBeGreaterThan(120)
  })
})

describe('associative search', () => {
  test('a person query clears every other filter and selects only that person', () => {
    const q = personQuery('director', 7)
    expect(q.alpha).toEqual({
      title: null,
      actor: null,
      actress: null,
      director: 7,
    })
    expect(q.length).toBeNull()
    expect(q.year).toBeNull()
    expect(q.certs).toBe(ALL_CERTS)
    expect(q.genres).toBe(ALL_GENRES)
  })

  test('applying it shows exactly that person’s films', () => {
    const { engine } = setup()
    const director = { names: ['A', 'B'], films: [[10, 20], [30]] }
    applyQuery(engine, personQuery('director', 0), { director })
    expect(engine.count).toBe(2)
    expect(engine.resultMask[10]).toBe(1)
    expect(engine.resultMask[20]).toBe(1)
  })
})
