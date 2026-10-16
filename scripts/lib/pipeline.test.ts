import { Readable } from 'node:stream'
import { describe, expect, test } from 'vitest'
import {
  buildOutputs,
  collationKey,
  collectCredits,
  genreFields,
  loadRatings,
  matchPhotos,
  neededNconsts,
  resolveNames,
  selectFilms,
} from './pipeline.ts'
import { readTsv, type Row } from './tsv.ts'

async function rows(tsv: string): Promise<Row[]> {
  const out: Row[] = []
  for await (const row of readTsv(
    Readable.from([tsv.trim().replace(/ +/g, '\t')]),
  ))
    out.push(row)
  return out
}

// Fields are separated by runs of spaces in the fixtures, converted to tabs by rows().
const RATINGS = `
tconst averageRating numVotes
tt1 8.5 5000
tt2 7.0 999
tt3 6.1 2000
tt4 9.0 1500
tt5 5.5 3000
tt6 7.7 4000
`
const BASICS = `
tconst titleType primaryTitle originalTitle isAdult startYear endYear runtimeMinutes genres
tt1 movie Alpha Alpha 0 1999 \\N 120 Drama,Sci-Fi
tt2 movie LowVotes LowVotes 0 2000 \\N 90 Comedy
tt3 tvSeries ASeries ASeries 0 2001 \\N 45 Drama
tt4 movie NoRuntime NoRuntime 0 2002 \\N \\N Drama
tt5 movie NoGenre NoGenre 0 2003 \\N 100 \\N
tt6 movie Zeta Zeta 0 2010 \\N 95 Western,Comedy
`
const PRINCIPALS = `
tconst ordering nconst category job characters
tt1 1 nm1 actor \\N \\N
tt1 2 nm2 actress \\N \\N
tt1 3 nm3 director \\N \\N
tt1 4 nm4 writer \\N \\N
tt6 1 nm3 director \\N \\N
tt6 2 nm1 actor \\N \\N
tt6 3 nm5 actor \\N \\N
tt6 4 nm6 actor \\N \\N
tt6 5 nm7 actor \\N \\N
tt6 6 nm8 actor \\N \\N
tt6 7 nm9 actor \\N \\N
tt9 1 nm1 actor \\N \\N
`
const NAMES = `
nconst primaryName birthYear
nm1 Éric_Zed 1950
nm2 Jane_Doe 1960
nm3 Alma_Director 1940
nm5 Bob 1970
nm6 Carl 1971
nm7 Dan 1972
nm8 Ed 1973
nm9 Fay 1974
`

async function build() {
  const ratings = await loadRatings(await rows(RATINGS))
  const films = await selectFilms(await rows(BASICS), ratings)
  const index = new Map(films.map((f, i) => [f.id, i]))
  const credits = await collectCredits(await rows(PRINCIPALS), index)
  const names = await resolveNames(await rows(NAMES), neededNconsts(credits))
  return { ratings, films, credits, names }
}

describe('pipeline', () => {
  test('ratings keeps only titles with >= 1000 votes', async () => {
    const ratings = await loadRatings(await rows(RATINGS))
    expect([...ratings.keys()].sort()).toEqual([
      'tt1',
      'tt3',
      'tt4',
      'tt5',
      'tt6',
    ])
  })

  test('film selection applies type, runtime, genre and vote filters', async () => {
    const { films } = await build()
    expect(films.map((f) => f.id)).toEqual(['tt1', 'tt6'])
    expect(films[0]).toMatchObject({
      title: 'Alpha',
      year: 1999,
      length: 120,
      rating: 8.5,
      votes: 5000,
    })
  })

  test('credits keep 3 directors, 5 actors and 5 actresses in billing order', async () => {
    const { credits } = await build()
    expect(credits.directors[0]).toEqual(['nm3'])
    expect(credits.actors[1]).toEqual(['nm1', 'nm5', 'nm6', 'nm7', 'nm8']) // nm9 is 6th
    expect(credits.actresses[0]).toEqual(['nm2'])
    expect(neededNconsts(credits).has('nm9')).toBe(false)
  })

  test('outputs are columnar, with people indexed by film and sorted by collation key', async () => {
    const { films, credits, names } = await build()
    const out = buildOutputs(films, credits, names, '2026-01-01T00:00:00.000Z')
    expect(out.films.count).toBe(2)
    expect(out.films.id).toEqual(['tt1', 'tt6'])
    expect(out.films.cert).toEqual([4, 4])
    expect(out.films.poster).toEqual([null, null])
    expect(out.people.actors.names).toEqual([
      'Bob',
      'Carl',
      'Dan',
      'Ed',
      'Éric_Zed',
    ])
    const zed = out.people.actors.names.indexOf('Éric_Zed')
    expect(out.people.actors.films[zed]).toEqual([0, 1])
    expect(out.people.directors.films[0]).toEqual([0, 1])
    // credits point at people by index, and the index leads back to the name
    const jane = out.credits.actresses[0]!
    expect(jane.map((i) => out.people.actresses.names[i])).toEqual(['Jane_Doe'])
    expect(out.meta.counts.films).toBe(2)
  })

  test('genre fields: first legend genre is primary, unknown genres set the other bit', () => {
    expect(genreFields(['Drama', 'Sci-Fi'])).toEqual({
      mask: 0b100001,
      primary: 0,
    })
    expect(genreFields(['Western', 'Comedy'])).toEqual({
      mask: 0b1000000010,
      primary: 1,
    })
    expect(genreFields(['Western'])).toEqual({ mask: 0b1000000000, primary: 9 })
  })

  test('collation key ignores case and accents', () => {
    expect(collationKey('Éric')).toBe('eric')
  })

  test('TMDB data fills certification, country, language and poster; films without it stay NR', async () => {
    const { films, credits, names } = await build()
    const enrich = new Map([
      [
        'tt1',
        {
          found: true,
          tmdbId: 5,
          poster: '/p.jpg',
          language: 'sv',
          countries: ['SE', 'DK'],
          usCertification: 'PG-13',
          directors: [],
          cast: [],
        },
      ],
    ])
    const out = buildOutputs(
      films,
      credits,
      names,
      '2026-01-01T00:00:00.000Z',
      enrich,
    )
    expect(out.films.cert).toEqual([2, 4]) // tt1 is PG-13, tt6 has no TMDB data
    expect(out.films.country).toEqual(['SE', ''])
    expect(out.films.language).toEqual(['sv', ''])
    expect(out.films.poster).toEqual(['/p.jpg', null])
    expect(out.meta.images).toEqual({
      poster: 'https://image.tmdb.org/t/p/w185{path}',
      avatar: 'https://image.tmdb.org/t/p/w45{path}',
    })
    expect(out.meta.source).toBe('imdb')
    expect(out.meta.hasRating).toBe(true)
  })

  test('a person’s photo is matched from TMDB by name and stored once per person', async () => {
    const { films, credits, names } = await build()
    const enrich = new Map([
      [
        'tt1',
        {
          found: true,
          tmdbId: 5,
          poster: null,
          language: '',
          countries: [],
          usCertification: null,
          directors: [{ name: 'Alma_Director', profile: '/dir.jpg' }],
          cast: [{ name: 'Eric_Zed', profile: '/eric.jpg' }],
        },
      ],
    ])
    // fixture names are single tokens, so TMDB's name matches the credit name directly
    const out = buildOutputs(films, credits, names, undefined, enrich)
    expect(out.people.directors.photos).toEqual(['/dir.jpg'])
    const zed = out.people.actors.names.indexOf('Éric_Zed')
    expect(out.people.actors.photos![zed]).toBe('/eric.jpg')
    expect(out.people.actors.photos!.filter((p) => p === null)).toHaveLength(4) // everyone else
  })

  test('two different people with the same name stay separate, each with their own films and photo', () => {
    const film = (id: string) => ({
      id,
      title: id,
      year: 2000,
      length: 100,
      rating: 7,
      votes: 5000,
      genres: ['Drama'],
    })
    const credits = {
      directors: [['nm1'], ['nm2'], ['nm1', 'nm2']],
      actors: [[], [], []],
      actresses: [[], [], []],
    }
    const names = new Map([
      ['nm1', 'Smith, John'],
      ['nm2', 'Smith, John'],
    ])
    const enrich = new Map([
      [
        'tt0',
        {
          found: true,
          tmdbId: 1,
          poster: null,
          language: '',
          countries: [],
          usCertification: null,
          directors: [{ name: 'John Smith', profile: '/first.jpg' }],
          cast: [],
        },
      ],
    ])
    const out = buildOutputs(
      [film('tt0'), film('tt1'), film('tt2')],
      credits,
      names,
      undefined,
      enrich,
    )
    expect(out.people.directors.names).toEqual(['Smith, John', 'Smith, John'])
    expect(out.people.directors.films).toEqual([
      [0, 2], // nm1: films 0 and 2
      [1, 2], // nm2: films 1 and 2
    ])
    expect(out.credits.directors).toEqual([[0], [1], [0, 1]])
    expect(out.people.directors.photos).toEqual(['/first.jpg', null]) // the photo went to nm1 only
  })
})

describe('matchPhotos', () => {
  test('matches "First Last" TMDB names to "Last, First" credits, ignoring case and accents', () => {
    const photos = matchPhotos(
      ['Bergman, Ingmar', 'Björnstrand, Gunnar', 'Nobody, Here'],
      [
        { name: 'Ingmar Bergman', profile: '/a.jpg' },
        { name: 'Gunnar Bjornstrand', profile: '/b.jpg' },
      ],
    )
    expect(photos).toEqual({
      'Bergman, Ingmar': '/a.jpg',
      'Björnstrand, Gunnar': '/b.jpg',
    })
  })

  test('first photo wins when TMDB lists the same name twice', () => {
    expect(
      matchPhotos(
        ['Doe, Jane'],
        [
          { name: 'Jane Doe', profile: '/first.jpg' },
          { name: 'Jane Doe', profile: '/second.jpg' },
        ],
      ),
    ).toEqual({ 'Doe, Jane': '/first.jpg' })
  })
})
