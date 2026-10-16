import { QueryEngine } from '../src/engine/engine.ts'
import { MaskFilter, RangeFilter, SetFilter } from '../src/engine/filters.ts'
import { FilmStore } from '../src/engine/store.ts'
import { syntheticFilms, syntheticPeople } from '../src/engine/synthetic.ts'

const ITERATIONS = 500

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function time(fn: () => void): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

function bench(count: number): void {
  const store = new FilmStore(syntheticFilms(count))
  const people = syntheticPeople(count, Math.floor(count / 3))
  const engine = new QueryEngine(store)
  const year = engine.addFilter('year', new RangeFilter(store.year))
  const length = engine.addFilter('length', new RangeFilter(store.length))
  const rating = engine.addFilter('rating', new RangeFilter(store.rating10))
  const cert = engine.addFilter('cert', new MaskFilter(store.certBit))
  const genre = engine.addFilter('genre', new MaskFilter(store.genreMask))
  const person = engine.addFilter('person', new SetFilter(count))

  // All six filters active, as in a heavily constrained query.
  year.set(1960, 2010)
  length.set(80, 180)
  rating.set(30, 99)
  cert.set(0b01111)
  genre.set(0b0111111111)
  person.set(people.films[0]!)
  engine.recompute()

  // The hot path: the user drags the year slider, so one mask is rebuilt and ANDed.
  const drag = Array.from({ length: ITERATIONS }, (_, i) =>
    time(() => {
      year.set(1920 + (i % 50), 1990 + (i % 34))
      engine.recompute()
    }),
  )

  // Valid values for the other widgets, computed after a change.
  const valid = Array.from({ length: ITERATIONS }, () =>
    time(() => {
      engine.validRange('length', store.length)
      engine.validBits('cert', store.certBit)
      engine.validBits('genre', store.genreMask)
    }),
  )

  // One alphaslider's valid-name pass over its whole inverted index.
  const names = Array.from({ length: 100 }, () =>
    time(() => engine.validNames('person', people.films)),
  )

  const fmt = (ms: number) => `${ms.toFixed(3)} ms`
  console.log(`${count.toLocaleString()} films`)
  console.log(
    `  drag update (rebuild one mask + recompute): median ${fmt(median(drag))}, max ${fmt(Math.max(...drag))}`,
  )
  console.log(
    `  valid ranges/bits for 3 widgets:            median ${fmt(median(valid))}`,
  )
  console.log(
    `  valid names over ${people.films.length.toLocaleString()} names:        median ${fmt(median(names))}`,
  )
}

bench(50_000)
bench(100_000)
