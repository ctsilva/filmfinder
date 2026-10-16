import type { FilmsFile, PeopleIndex } from './schema.ts'

/** Small deterministic PRNG (mulberry32), so tests and benchmarks are repeatable. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random films with realistic ranges: years 1920-2024, rating 1.0-9.9, 10 genre bits. */
export function syntheticFilms(count: number, seed = 1): FilmsFile {
  const rng = makeRng(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
  const f: FilmsFile = {
    count,
    id: [],
    title: [],
    year: [],
    length: [],
    rating: [],
    votes: [],
    genreMask: [],
    primaryGenre: [],
    cert: [],
    country: [],
    language: [],
    poster: [],
  }
  for (let i = 0; i < count; i++) {
    let mask = 0
    for (let n = int(1, 3); n > 0; n--) mask |= 1 << int(0, 9)
    f.id.push(`tt${i}`)
    f.title.push(`Film ${i}`)
    f.year.push(int(1920, 2024))
    f.length.push(int(60, 240))
    f.rating.push(int(10, 99) / 10)
    f.votes.push(int(1000, 2_000_000))
    f.genreMask.push(mask)
    f.primaryGenre.push(Math.log2(mask & -mask))
    f.cert.push(int(0, 4))
    f.country.push('')
    f.language.push('')
    f.poster.push(null)
  }
  return f
}

/** Random inverted index: `names` names, each credited on a few random films. */
export function syntheticPeople(
  count: number,
  names: number,
  seed = 2,
): PeopleIndex {
  const rng = makeRng(seed)
  const films: number[][] = []
  for (let k = 0; k < names; k++) {
    const set = new Set<number>()
    for (let n = 1 + Math.floor(rng() * 6); n > 0; n--)
      set.add(Math.floor(rng() * count))
    films.push([...set].sort((a, b) => a - b))
  }
  return { names: films.map((_, k) => `Person ${k}`), films }
}
