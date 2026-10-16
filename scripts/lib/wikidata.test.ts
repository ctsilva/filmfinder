import { describe, expect, test } from 'vitest'
import {
  assembleFilms,
  attributesQuery,
  buildWikidataOutputs,
  commonsPath,
  legendGenresFor,
  parseAttributes,
  parseCore,
  parseFilmList,
  buildFilmPeople,
  parsePersons,
  parseRelations,
  pickCert,
  pickCountry,
  qid,
  type Binding,
} from './wikidata.ts'

const E = 'http://www.wikidata.org/entity/'
const row = (o: Record<string, string>): Binding =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]))

describe('parsing', () => {
  test('qid strips the entity URL', () => {
    expect(qid(`${E}Q42`)).toBe('Q42')
  })

  test('film list dedupes films and keeps the sitelink count', () => {
    const list = parseFilmList([
      row({ f: `${E}Q1`, sl: '40' }),
      row({ f: `${E}Q1`, sl: '40' }),
      row({ f: `${E}Q2`, sl: '31' }),
    ])
    expect([...list]).toEqual([
      ['Q1', 40],
      ['Q2', 31],
    ])
  })

  test('core info takes the earliest year and the shortest runtime, in minutes', () => {
    const core = parseCore([
      row({
        f: `${E}Q1`,
        title: 'Alpha',
        date: '1972-03-24T00:00:00Z',
        sec: '10500',
      }),
      row({
        f: `${E}Q1`,
        title: 'Alpha',
        date: '1971-12-01T00:00:00Z',
        sec: '12000',
      }),
      row({ f: `${E}Q2`, title: 'No runtime', date: '1990-01-01T00:00:00Z' }),
    ])
    expect(core.get('Q1')).toEqual({ title: 'Alpha', year: 1971, minutes: 175 })
    expect(core.has('Q2')).toBe(false)
  })

  test('attributes collect genres, MPA ratings, countries, languages and the poster', () => {
    const attrs = parseAttributes([
      row({ f: `${E}Q1`, kind: 'genre', v: `${E}Q130232` }),
      row({ f: `${E}Q1`, kind: 'genre', v: `${E}Q157443` }),
      row({ f: `${E}Q1`, kind: 'mpa', v: 'PG-13' }),
      row({ f: `${E}Q1`, kind: 'country', v: 'US' }),
      row({ f: `${E}Q1`, kind: 'language', v: 'en' }),
      row({
        f: `${E}Q1`,
        kind: 'poster',
        v: 'http://commons.wikimedia.org/wiki/Special:FilePath/Alpha%20poster.jpg',
      }),
    ]).get('Q1')!
    expect([...attrs.genres]).toEqual(['Q130232', 'Q157443'])
    expect([...attrs.mpa]).toEqual(['PG-13'])
    expect(attrs.poster).toBe('Alpha%20poster.jpg')
  })

  test('relations list the credited people per film, once each', () => {
    const rel = parseRelations([
      row({ f: `${E}Q1`, role: 'director', p: `${E}Q10` }),
      row({ f: `${E}Q1`, role: 'cast', p: `${E}Q11` }),
      row({ f: `${E}Q1`, role: 'cast', p: `${E}Q11` }),
      row({ f: `${E}Q1`, role: 'cast', p: `${E}Q12` }),
    ]).get('Q1')!
    expect(rel).toEqual({ directors: ['Q10'], cast: ['Q11', 'Q12'] })
  })

  test('persons: genders, fame, and the first photo of several', () => {
    const persons = parsePersons([
      row({
        p: `${E}Q11`,
        name: 'Ann Actress',
        gender: `${E}Q6581072`,
        psl: '90',
        img: 'http://commons.wikimedia.org/wiki/Special:FilePath/Ann%201.jpg',
      }),
      row({
        p: `${E}Q11`,
        name: 'Ann Actress',
        gender: `${E}Q6581072`,
        psl: '90',
        img: 'http://commons.wikimedia.org/wiki/Special:FilePath/Ann%202.jpg',
      }),
      row({
        p: `${E}Q12`,
        name: 'Bob Actor',
        gender: `${E}Q6581097`,
        psl: '10',
      }),
      row({ p: `${E}Q13`, name: 'No Gender' }),
    ])
    expect(persons.size).toBe(3)
    expect(persons.get('Q11')).toMatchObject({
      gender: 'female',
      image: 'Ann%201.jpg',
      fame: 90,
    })
    expect(persons.get('Q12')).toMatchObject({
      gender: 'male',
      image: null,
      fame: 10,
    })
    expect(persons.get('Q13')).toMatchObject({ gender: null, fame: 0 })
  })

  test('film people drop credits whose person has no English label', () => {
    const rel = new Map([['Q1', { directors: ['Q10'], cast: ['Q11', 'Q99'] }]])
    const persons = parsePersons([
      row({ p: `${E}Q10`, name: 'Dir Ector' }),
      row({ p: `${E}Q11`, name: 'Ann Actress' }),
    ])
    const people = buildFilmPeople(rel, persons).get('Q1')!
    expect(people.directors.map((p) => p.name)).toEqual(['Dir Ector'])
    expect(people.cast.map((p) => p.name)).toEqual(['Ann Actress'])
  })

  test('commonsPath keeps the encoded file name', () => {
    expect(
      commonsPath(
        'http://commons.wikimedia.org/wiki/Special:FilePath/A%20B.png',
      ),
    ).toBe('A%20B.png')
  })
})

describe('mapping', () => {
  test('genres map to legend names in priority order, with Other for unlisted genres', () => {
    expect(legendGenresFor(new Set(['Q130232', 'Q471839']))).toEqual([
      'Sci-Fi',
      'Drama',
    ])
    expect(legendGenresFor(new Set(['Q860626']))).toEqual(['Romance', 'Comedy'])
    expect(legendGenresFor(new Set(['Q130232', 'Q2484376']))).toEqual([
      'Drama',
      'Other',
    ])
    expect(legendGenresFor(new Set(['Q2484376']))).toEqual(['Other'])
  })

  test('animated and anime films count as Animation even though that is their type, not a genre', () => {
    expect(legendGenresFor(new Set(['Q202866']))).toEqual(['Animation'])
    expect(legendGenresFor(new Set(['Q20650540', 'Q157394']))).toEqual([
      'Animation',
      'Other',
    ]) // anime film + fantasy
    // and the query asks for the type as well as the genre
    const query = attributesQuery(['Q1'])
    expect(query).toContain('wdt:P136')
    expect(query).toContain('wd:Q202866')
    expect(query).toContain('wd:Q20650540')
  })

  test('country prefers the US, otherwise the alphabetically first', () => {
    expect(pickCountry(new Set(['IT', 'US']))).toBe('US')
    expect(pickCountry(new Set(['IT', 'FR']))).toBe('FR')
    expect(pickCountry(new Set())).toBe('')
  })

  test('certification: G, PG, PG-13 and R map; everything else is NR', () => {
    expect(pickCert(new Set(['R']))).toBe(3)
    expect(pickCert(new Set(['PG-13']))).toBe(2)
    expect(pickCert(new Set(['NC-17']))).toBe(4)
    expect(pickCert(new Set(['M/PG', 'PG']))).toBe(1)
    expect(pickCert(new Set())).toBe(4)
  })
})

function sample() {
  const list = new Map([
    ['Q1', 100],
    ['Q2', 50],
    ['Q3', 40],
  ])
  const core = parseCore([
    row({
      f: `${E}Q1`,
      title: 'Alpha',
      date: '1972-01-01T00:00:00Z',
      sec: '9000',
    }),
    row({
      f: `${E}Q2`,
      title: 'Beta',
      date: '1999-01-01T00:00:00Z',
      sec: '6000',
    }),
    row({
      f: `${E}Q3`,
      title: 'Q3',
      date: '2001-01-01T00:00:00Z',
      sec: '6000',
    }), // no English label
  ])
  const attrs = parseAttributes([
    row({ f: `${E}Q1`, kind: 'genre', v: `${E}Q130232` }),
    row({ f: `${E}Q1`, kind: 'mpa', v: 'R' }),
    row({ f: `${E}Q1`, kind: 'country', v: 'US' }),
    row({ f: `${E}Q1`, kind: 'language', v: 'en' }),
  ])
  const relations = parseRelations([
    row({ f: `${E}Q1`, role: 'director', p: `${E}Q10` }),
    ...[1, 2, 3, 4, 5, 6, 7].map((i) =>
      row({ f: `${E}Q1`, role: 'cast', p: `${E}Q2${i}` }),
    ),
    row({ f: `${E}Q1`, role: 'cast', p: `${E}Q30` }),
  ])
  const persons = parsePersons([
    row({
      p: `${E}Q10`,
      name: 'Francis Ford Coppola',
      psl: '90',
      img: 'http://x/Special:FilePath/FFC.jpg',
    }),
    ...[1, 2, 3, 4, 5, 6, 7].map((i) =>
      row({
        p: `${E}Q2${i}`,
        name: `Actor Num${i}`,
        gender: `${E}Q6581097`,
        psl: String(100 - i),
      }),
    ),
    row({
      p: `${E}Q30`,
      name: 'Diane Keaton',
      gender: `${E}Q6581072`,
      psl: '98',
      img: 'http://x/Special:FilePath/DK.jpg',
    }),
  ])
  const people = buildFilmPeople(relations, persons)
  return { list, core, attrs, people }
}

describe('assembly', () => {
  test('films are joined, filtered and sorted by popularity', () => {
    const { list, core, attrs, people } = sample()
    const films = assembleFilms(list, core, attrs, people)
    expect(films.map((f) => f.id)).toEqual(['Q1', 'Q2']) // Q3 has no usable title
    expect(films[0]).toMatchObject({
      title: 'Alpha',
      year: 1972,
      length: 150,
      cert: 3,
      country: 'US',
      language: 'en',
      genres: ['Drama'],
    })
    expect(films[1]).toMatchObject({
      cert: 4,
      country: '',
      genres: [],
    })
  })

  test('cast is split by gender, best known first, and capped at five', () => {
    const { list, core, attrs, people } = sample()
    const [alpha] = assembleFilms(list, core, attrs, people)
    expect(alpha!.actors.map((p) => p.name)).toEqual([
      'Actor Num1',
      'Actor Num2',
      'Actor Num3',
      'Actor Num4',
      'Actor Num5',
    ])
    expect(alpha!.actresses.map((p) => p.name)).toEqual(['Diane Keaton'])
    expect(alpha!.directors.map((p) => p.name)).toEqual([
      'Francis Ford Coppola',
    ])
  })

  test('outputs follow the shared schema, with popularity in place of a rating', () => {
    const { list, core, attrs, people } = sample()
    const out = buildWikidataOutputs(
      assembleFilms(list, core, attrs, people),
      '2026-01-01T00:00:00.000Z',
    )
    expect(out.films.count).toBe(2)
    expect(out.films.votes).toEqual([100, 50])
    expect(out.films.rating).toEqual([0, 0])
    expect(out.films.cert).toEqual([3, 4])
    expect(out.credits.directors[0]).toEqual([0]) // index into people.directors
    expect(out.people.directors.names).toEqual(['Coppola, Francis Ford'])
    expect(out.people.directors.photos).toEqual(['FFC.jpg'])
    expect(out.people.actresses.names).toEqual(['Keaton, Diane'])
    expect(out.people.actresses.photos).toEqual(['DK.jpg'])
    expect(out.people.directors.films).toEqual([[0]])
    expect(out.meta).toMatchObject({
      source: 'wikidata',
      hasRating: false,
      popularityLabel: 'Wikipedia editions',
      version: 3,
    })
    expect(out.meta.images?.poster).toContain('{path}')
  })
})

describe('namesakes', () => {
  test('two people with the same name but different Wikidata ids stay separate', () => {
    const list = new Map([
      ['Q1', 100],
      ['Q2', 90],
    ])
    const core = parseCore([
      row({
        f: `${E}Q1`,
        title: 'One',
        date: '1990-01-01T00:00:00Z',
        sec: '6000',
      }),
      row({
        f: `${E}Q2`,
        title: 'Two',
        date: '1991-01-01T00:00:00Z',
        sec: '6000',
      }),
    ])
    const relations = parseRelations([
      row({ f: `${E}Q1`, role: 'director', p: `${E}Q10` }),
      row({ f: `${E}Q2`, role: 'director', p: `${E}Q11` }),
    ])
    const persons = parsePersons([
      row({
        p: `${E}Q10`,
        name: 'John Smith',
        img: 'http://x/Special:FilePath/A.jpg',
      }),
      row({ p: `${E}Q11`, name: 'John Smith' }),
    ])
    const out = buildWikidataOutputs(
      assembleFilms(list, core, new Map(), buildFilmPeople(relations, persons)),
    )
    expect(out.people.directors.names).toEqual(['Smith, John', 'Smith, John'])
    expect(out.people.directors.films).toEqual([[0], [1]])
    expect(out.people.directors.photos).toEqual(['A.jpg', null])
    expect(out.credits.directors).toEqual([[0], [1]])
  })
})
