import { describe, expect, test } from 'vitest'
import { QueryEngine } from './engine.ts'
import { MaskFilter, RangeFilter, SetFilter } from './filters.ts'
import { makeRng, syntheticFilms, syntheticPeople } from './synthetic.ts'
import { FilmStore } from './store.ts'

function setup(count: number, seed = 1) {
  const file = syntheticFilms(count, seed)
  const store = new FilmStore(file)
  const engine = new QueryEngine(store)
  const year = engine.addFilter('year', new RangeFilter(store.year))
  const length = engine.addFilter('length', new RangeFilter(store.length))
  const rating = engine.addFilter('rating', new RangeFilter(store.rating10))
  const cert = engine.addFilter('cert', new MaskFilter(store.certBit))
  const genre = engine.addFilter('genre', new MaskFilter(store.genreMask))
  const person = engine.addFilter('person', new SetFilter(count))
  return { file, store, engine, year, length, rating, cert, genre, person }
}

describe('QueryEngine basics', () => {
  test('with no active filters every film passes', () => {
    const { engine, store } = setup(100)
    engine.recompute()
    expect(engine.count).toBe(store.count)
  })

  test('rating tenths avoid float32 rounding at the bound', () => {
    const file = syntheticFilms(3)
    file.rating = [7.1, 7.0, 7.2]
    const store = new FilmStore(file)
    const engine = new QueryEngine(store)
    const r = engine.addFilter('rating', new RangeFilter(store.rating10))
    r.set(71, 100)
    engine.recompute()
    expect([...engine.resultMask]).toEqual([1, 0, 1])
  })

  test('clearing a filter restores its films', () => {
    const { engine, year } = setup(500)
    year.set(2000, 2000)
    engine.recompute()
    const narrow = engine.count
    year.clear()
    engine.recompute()
    expect(engine.count).toBe(500)
    expect(narrow).toBeLessThan(500)
  })

  test('version increments on each recompute', () => {
    const { engine } = setup(10)
    const v = engine.version
    engine.recompute()
    expect(engine.version).toBe(v + 1)
  })
})

describe('tight coupling', () => {
  test('a widget ignores its own filter but respects the others', () => {
    const { engine, year, length, store } = setup(2000)
    year.set(1990, 1999)
    length.set(100, 120)
    engine.recompute()

    const range = engine.validRange('year', store.year)!
    // year's own filter is ignored: valid years extend outside 1990-1999
    // whenever films of length 100-120 exist in other decades.
    expect(range.min).toBeLessThan(1990)
    expect(range.max).toBeGreaterThan(1999)
    // but every contributing film still satisfies the length filter
    const mask = engine.maskExcluding('year')
    for (let i = 0; i < store.count; i++) {
      if (mask[i])
        expect(store.length[i]! >= 100 && store.length[i]! <= 120).toBe(true)
    }
  })

  test('validRange is null when nothing matches', () => {
    const { engine, year, length, store } = setup(200)
    length.set(500, 600)
    engine.recompute()
    expect(engine.validRange('year', store.year)).toBeNull()
    year.clear()
  })

  test('validBits reports which cert values still occur', () => {
    const { engine, year, store } = setup(300)
    year.set(2000, 2000)
    engine.recompute()
    const seen = engine.validBits('cert', store.certBit)
    const expected = new Set<number>()
    for (let i = 0; i < store.count; i++)
      if (store.year[i] === 2000) expected.add(store.cert[i]!)
    for (let c = 0; c < 5; c++)
      expect((seen >> c) & 1).toBe(expected.has(c) ? 1 : 0)
  })

  test('validNames marks names with at least one film in the mask', () => {
    const { engine, year, store } = setup(1000)
    const people = syntheticPeople(1000, 300)
    year.set(2010, 2012)
    engine.recompute()
    const valid = engine.validNames('person', people.films)
    people.films.forEach((list, k) => {
      const has = list.some(
        (i) => store.year[i]! >= 2010 && store.year[i]! <= 2012,
      )
      expect(valid[k]).toBe(has ? 1 : 0)
    })
  })
})

describe('property: engine equals a naive Array.filter', () => {
  test('random filter combinations', () => {
    const n = 3000
    const { file, store, engine, year, length, rating, cert, genre, person } =
      setup(n, 7)
    const people = syntheticPeople(n, 200, 9)
    const rng = makeRng(123)
    const int = (lo: number, hi: number) =>
      lo + Math.floor(rng() * (hi - lo + 1))

    for (let iter = 0; iter < 300; iter++) {
      const preds: ((i: number) => boolean)[] = []

      if (rng() < 0.6) {
        const a = int(1920, 2024)
        const b = int(a, 2024)
        year.set(a, b)
        preds.push((i) => file.year[i]! >= a && file.year[i]! <= b)
      } else year.clear()

      if (rng() < 0.6) {
        const a = int(60, 240)
        const b = int(a, 240)
        length.set(a, b)
        preds.push((i) => file.length[i]! >= a && file.length[i]! <= b)
      } else length.clear()

      if (rng() < 0.6) {
        const a = int(10, 99)
        const b = int(a, 99)
        rating.set(a, b)
        preds.push(
          (i) =>
            Math.round(file.rating[i]! * 10) >= a &&
            Math.round(file.rating[i]! * 10) <= b,
        )
      } else rating.clear()

      if (rng() < 0.5) {
        const allowed = int(0, 31)
        cert.set(allowed)
        preds.push((i) => ((1 << file.cert[i]!) & allowed) !== 0)
      } else cert.clear()

      if (rng() < 0.5) {
        const allowed = int(0, 1023)
        genre.set(allowed)
        preds.push((i) => (file.genreMask[i]! & allowed) !== 0)
      } else genre.clear()

      if (rng() < 0.3) {
        const k = int(0, people.films.length - 1)
        person.set(people.films[k]!)
        const set = new Set(people.films[k])
        preds.push((i) => set.has(i))
      } else person.clear()

      engine.recompute()

      const expected: number[] = []
      for (let i = 0; i < n; i++) if (preds.every((p) => p(i))) expected.push(i)
      const actual: number[] = []
      for (let i = 0; i < n; i++) if (engine.resultMask[i]) actual.push(i)

      expect(actual).toEqual(expected)
      expect(engine.count).toBe(expected.length)
    }
    expect(store.count).toBe(n)
  })
})

describe('presentValues', () => {
  test('lists the distinct values among the films the other filters leave', () => {
    const { engine, store, length } = setup(1000, 11)
    length.set(100, 110)
    engine.recompute()
    const years = engine.presentValues('year', store.year)
    const expected = new Set<number>()
    for (let i = 0; i < store.count; i++) {
      if (store.length[i]! >= 100 && store.length[i]! <= 110)
        expected.add(store.year[i]!)
    }
    expect(years).toEqual([...expected].sort((a, b) => a - b))
  })

  test('ignores the widget’s own filter', () => {
    const { engine, store, year } = setup(1000, 12)
    year.set(2000, 2000)
    engine.recompute()
    expect(engine.presentValues('year', store.year).length).toBeGreaterThan(1)
  })

  test('is empty when no film matches', () => {
    const { engine, store, length } = setup(200, 13)
    length.set(900, 999)
    engine.recompute()
    expect(engine.presentValues('year', store.year)).toEqual([])
  })
})
