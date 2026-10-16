/**
 * Wikidata as a data source: SPARQL queries, parsing, and assembling the same
 * JSON files the IMDb pipeline writes. Wikidata is CC0, so a small extract can
 * be committed to the repository.
 *
 * Differences from the IMDb pipeline:
 * - There is no rating. Popularity is the number of Wikipedia language editions
 *   an item has, stored in `votes`, and the Y axis uses it.
 * - Certification is the MPA rating where Wikidata has one (about half of films).
 * - Cast has no billing order, so the best-known people (most Wikipedia editions) come first.
 */

import type {
  CreditsFile,
  FilmsFile,
  MetaFile,
  PeopleFile,
} from '../../src/engine/schema.ts'
import { lastFirst } from '../../src/engine/names.ts'
import {
  LEGEND_GENRES,
  MAX_ACTORS,
  MAX_ACTRESSES,
  MAX_DIRECTORS,
} from './config.ts'
import { genreFields } from './pipeline.ts'
import { buildPeopleIndex, type PersonRecord } from './people.ts'
import { certCode } from './tmdb.ts'

export type Binding = Record<string, { value: string } | undefined>

export const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql'
export const COMMONS_FILE_PATH =
  'https://commons.wikimedia.org/wiki/Special:FilePath/'

/** Default cut-off: films with at least this many Wikipedia language editions. */
export const DEFAULT_MIN_SITELINKS = 30

// ---- Queries ----------------------------------------------------------------------------------

/**
 * Wikidata "instance of" classes counted as films. Many well-known animated films are filed
 * under "animated film" or "anime film" and not under plain "film", so asking for "film" alone
 * leaves them out (and with them most of the Animation genre).
 */
const FILM_CLASSES = ['Q11424', 'Q202866', 'Q20650540'] // film, animated film, anime film

/** Every film with a release date and a runtime that is well known enough. Cheap: no labels. */
export function filmListQuery(minSitelinks: number): string {
  return `SELECT DISTINCT ?f ?sl WHERE {
  VALUES ?class { ${FILM_CLASSES.map((c) => `wd:${c}`).join(' ')} }
  ?f wdt:P31 ?class; wikibase:sitelinks ?sl; wdt:P577 ?d; wdt:P2047 ?r.
  FILTER(?sl >= ${minSitelinks})
}`
}

const values = (ids: string[]) =>
  `VALUES ?f { ${ids.map((id) => `wd:${id}`).join(' ')} }`

/** Title, release dates and runtimes (normalised to seconds) for a batch of films. */
export function coreQuery(ids: string[]): string {
  return `SELECT ?f ?title ?date ?sec WHERE {
  ${values(ids)}
  ?f rdfs:label ?title. FILTER(LANG(?title) = "en")
  ?f wdt:P577 ?date.
  ?f p:P2047/psn:P2047/wikibase:quantityAmount ?sec.
}`
}

/** Genres, MPA rating, country, language and poster for a batch of films, one row per value. */
export function attributesQuery(ids: string[]): string {
  return `SELECT ?f ?kind ?v WHERE {
  ${values(ids)}
  { ?f wdt:P136 ?v. BIND("genre" AS ?kind) }
  # Animation is usually the film's type (animated film, anime film) and not a listed genre
  UNION { ?f wdt:P31 ?v. FILTER(?v IN (wd:Q202866, wd:Q20650540)) BIND("genre" AS ?kind) }
  UNION { ?f wdt:P1657 ?m. ?m rdfs:label ?v. FILTER(LANG(?v) = "en") BIND("mpa" AS ?kind) }
  UNION { ?f wdt:P495/wdt:P297 ?v. BIND("country" AS ?kind) }
  UNION { ?f wdt:P364/wdt:P218 ?v. BIND("language" AS ?kind) }
  UNION { ?f wdt:P3383 ?v. BIND("poster" AS ?kind) }
}`
}

/**
 * Which people are credited on a batch of films. Kept separate from the person details:
 * one query joining films, people, labels, genders and images times out on Wikidata.
 */
export function relationsQuery(ids: string[]): string {
  return `SELECT ?f ?role ?p WHERE {
  ${values(ids)}
  { ?f wdt:P57 ?p. BIND("director" AS ?role) }
  UNION { ?f wdt:P161 ?p. BIND("cast" AS ?role) }
}`
}

/** Name, gender, fame and photo for a batch of people. */
export function personQuery(personIds: string[]): string {
  return `SELECT ?p ?name ?gender ?psl ?img WHERE {
  VALUES ?p { ${personIds.map((id) => `wd:${id}`).join(' ')} }
  ?p rdfs:label ?name. FILTER(LANG(?name) = "en")
  OPTIONAL { ?p wdt:P21 ?gender }
  OPTIONAL { ?p wikibase:sitelinks ?psl }
  OPTIONAL { ?p wdt:P18 ?img }
}`
}

// ---- Parsing ----------------------------------------------------------------------------------

/** "http://www.wikidata.org/entity/Q42" -> "Q42" */
export function qid(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1)
}

const text = (b: Binding, key: string): string | undefined => b[key]?.value

export function parseFilmList(rows: Binding[]): Map<string, number> {
  const films = new Map<string, number>()
  for (const row of rows) {
    const id = qid(text(row, 'f')!)
    films.set(id, Math.max(films.get(id) ?? 0, Number(text(row, 'sl'))))
  }
  return films
}

export interface CoreInfo {
  title: string
  /** Earliest release year. */
  year: number
  /** Shortest listed runtime, in minutes (longer ones are usually extended cuts). */
  minutes: number
}

export function parseCore(rows: Binding[]): Map<string, CoreInfo> {
  const years = new Map<string, number>()
  const seconds = new Map<string, number>()
  const titles = new Map<string, string>()
  for (const row of rows) {
    const id = qid(text(row, 'f')!)
    titles.set(id, text(row, 'title')!)
    const year = Number.parseInt(text(row, 'date')!.slice(0, 4), 10)
    if (year > 1800) years.set(id, Math.min(years.get(id) ?? Infinity, year))
    const sec = Number(text(row, 'sec'))
    if (sec > 0) seconds.set(id, Math.min(seconds.get(id) ?? Infinity, sec))
  }
  const core = new Map<string, CoreInfo>()
  for (const [id, title] of titles) {
    const year = years.get(id)
    const sec = seconds.get(id)
    if (year === undefined || sec === undefined) continue
    core.set(id, { title, year, minutes: Math.round(sec / 60) })
  }
  return core
}

export interface Attributes {
  genres: Set<string>
  mpa: Set<string>
  countries: Set<string>
  languages: Set<string>
  poster: string | null
}

export function parseAttributes(rows: Binding[]): Map<string, Attributes> {
  const out = new Map<string, Attributes>()
  for (const row of rows) {
    const id = qid(text(row, 'f')!)
    let a = out.get(id)
    if (!a) {
      a = {
        genres: new Set(),
        mpa: new Set(),
        countries: new Set(),
        languages: new Set(),
        poster: null,
      }
      out.set(id, a)
    }
    const v = text(row, 'v')!
    switch (text(row, 'kind')) {
      case 'genre':
        a.genres.add(qid(v))
        break
      case 'mpa':
        a.mpa.add(v)
        break
      case 'country':
        a.countries.add(v)
        break
      case 'language':
        a.languages.add(v)
        break
      case 'poster':
        a.poster ??= commonsPath(v)
        break
    }
  }
  return out
}

export interface Person {
  id: string
  name: string
  gender: 'male' | 'female' | null
  /** Number of Wikipedia language editions: a stand-in for how well known the person is. */
  fame: number
  /** Commons file name, already URL-encoded, or null. */
  image: string | null
}

export interface FilmPeople {
  directors: Person[]
  cast: Person[]
}

const MALE = new Set(['Q6581097', 'Q2449503']) // male, trans man
const FEMALE = new Set(['Q6581072', 'Q1052281']) // female, trans woman

/** "http://commons.wikimedia.org/wiki/Special:FilePath/Foo%20Bar.jpg" -> "Foo%20Bar.jpg" */
export function commonsPath(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1)
}

export interface Relations {
  directors: string[]
  cast: string[]
}

/** Person ids credited on each film, in the order Wikidata returned them, without repeats. */
export function parseRelations(rows: Binding[]): Map<string, Relations> {
  const films = new Map<string, Relations>()
  for (const row of rows) {
    const film = qid(text(row, 'f')!)
    const person = qid(text(row, 'p')!)
    let entry = films.get(film)
    if (!entry) {
      entry = { directors: [], cast: [] }
      films.set(film, entry)
    }
    const list = text(row, 'role') === 'director' ? entry.directors : entry.cast
    if (!list.includes(person)) list.push(person)
  }
  return films
}

/** People by id. A person with several photos keeps the first. */
export function parsePersons(rows: Binding[]): Map<string, Person> {
  const persons = new Map<string, Person>()
  for (const row of rows) {
    const id = qid(text(row, 'p')!)
    let person = persons.get(id)
    if (!person) {
      const g = text(row, 'gender')
      const gid = g ? qid(g) : ''
      person = {
        id,
        name: text(row, 'name')!,
        gender: MALE.has(gid) ? 'male' : FEMALE.has(gid) ? 'female' : null,
        fame: Number(text(row, 'psl') ?? 0) || 0,
        image: null,
      }
      persons.set(id, person)
    }
    const img = text(row, 'img')
    if (img && person.image === null) person.image = commonsPath(img)
  }
  return persons
}

/** Attach person details to each film's credits. People without an English label are dropped. */
export function buildFilmPeople(
  relations: Map<string, Relations>,
  persons: Map<string, Person>,
): Map<string, FilmPeople> {
  const resolve = (ids: string[]) => ids.flatMap((id) => persons.get(id) ?? [])
  const out = new Map<string, FilmPeople>()
  for (const [film, r] of relations) {
    out.set(film, { directors: resolve(r.directors), cast: resolve(r.cast) })
  }
  return out
}

// ---- Mapping to the app's categories ----------------------------------------------------------

/** Wikidata genre items (QIDs) for each of the nine legend genres. */
const GENRE_ITEMS: Record<(typeof LEGEND_GENRES)[number], string[]> = {
  Drama: ['Q130232', 'Q859369'], // drama film, comedy drama
  Comedy: ['Q157443', 'Q859369', 'Q860626'], // comedy film, comedy drama, romantic comedy
  Action: ['Q188473', 'Q1535153'], // action film, superhero film
  Romance: ['Q1054574', 'Q860626'], // romance film, romantic comedy
  Horror: ['Q200092'],
  'Sci-Fi': ['Q471839'],
  Mystery: ['Q1200678'],
  Documentary: ['Q93204'],
  Animation: ['Q202866', 'Q20650540'], // animated film, anime film (these are film types, see attributesQuery)
}

/**
 * Wikidata genres are a set with no order, so the colour genre is chosen by
 * priority: the specific genres first, then the broad Comedy and Drama.
 */
const GENRE_PRIORITY: (typeof LEGEND_GENRES)[number][] = [
  'Documentary',
  'Animation',
  'Horror',
  'Sci-Fi',
  'Action',
  'Mystery',
  'Romance',
  'Comedy',
  'Drama',
]

/** Legend genre names for a film in priority order, plus "Other" if it has a genre we do not list. */
export function legendGenresFor(genreIds: Set<string>): string[] {
  const names: string[] = GENRE_PRIORITY.filter((name) =>
    GENRE_ITEMS[name].some((id) => genreIds.has(id)),
  )
  const known = new Set(Object.values(GENRE_ITEMS).flat())
  if ([...genreIds].some((id) => !known.has(id))) names.push('Other')
  return names
}

/** The US if it is among the production countries, otherwise the alphabetically first. */
export function pickCountry(countries: Set<string>): string {
  if (countries.has('US')) return 'US'
  return [...countries].sort()[0] ?? ''
}

/** First listed MPA rating that maps to G, PG, PG-13 or R; otherwise NR (code 4). */
export function pickCert(labels: Set<string>): number {
  const codes = [...labels].map((l) => certCode(l)).filter((c) => c !== 4)
  return codes.length ? Math.min(...codes) : 4
}

// ---- Assembly ---------------------------------------------------------------------------------

export interface WdFilm {
  id: string
  title: string
  year: number
  length: number
  popularity: number
  genres: string[]
  cert: number
  country: string
  language: string
  poster: string | null
  directors: Person[]
  actors: Person[]
  actresses: Person[]
}

const byFame = (a: Person, b: Person) =>
  b.fame - a.fame || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** Combine the parsed query results into films. Films missing a title, year or runtime are dropped. */
export function assembleFilms(
  list: Map<string, number>,
  core: Map<string, CoreInfo>,
  attrs: Map<string, Attributes>,
  people: Map<string, FilmPeople>,
): WdFilm[] {
  const films: WdFilm[] = []
  for (const [id, popularity] of list) {
    const c = core.get(id)
    if (!c || c.minutes <= 0 || /^Q\d+$/.test(c.title)) continue
    const a = attrs.get(id)
    const p = people.get(id)
    const cast = [...(p?.cast ?? [])].sort(byFame)
    films.push({
      id,
      title: c.title,
      year: c.year,
      length: c.minutes,
      popularity,
      genres: legendGenresFor(a?.genres ?? new Set()),
      cert: pickCert(a?.mpa ?? new Set()),
      country: pickCountry(a?.countries ?? new Set()),
      language: [...(a?.languages ?? [])].sort()[0] ?? '',
      poster: a?.poster ?? null,
      directors: [...(p?.directors ?? [])].sort(byFame).slice(0, MAX_DIRECTORS),
      actors: cast.filter((x) => x.gender === 'male').slice(0, MAX_ACTORS),
      actresses: cast
        .filter((x) => x.gender === 'female')
        .slice(0, MAX_ACTRESSES),
    })
  }
  // Most popular first: a stable order, and index 0 wins overplotting ties.
  films.sort((x, y) => y.popularity - x.popularity || (x.id < y.id ? -1 : 1))
  return films
}

export interface WikidataOutputs {
  films: FilmsFile
  people: PeopleFile
  credits: CreditsFile
  meta: MetaFile
}

export function buildWikidataOutputs(
  films: WdFilm[],
  buildDate = new Date().toISOString(),
): WikidataOutputs {
  // People are identified by their Wikidata id, so namesakes stay separate.
  const records = (pick: (f: WdFilm) => Person[]): PersonRecord[][] =>
    films.map((f) =>
      pick(f).map((p) => ({
        id: p.id,
        name: lastFirst(p.name),
        photo: p.image,
      })),
    )
  const directors = buildPeopleIndex(records((f) => f.directors))
  const actors = buildPeopleIndex(records((f) => f.actors))
  const actresses = buildPeopleIndex(records((f) => f.actresses))
  const credits: CreditsFile = {
    directors: directors.credits,
    actors: actors.credits,
    actresses: actresses.credits,
  }

  const genre = films.map((f) => genreFields(f.genres))
  const filmsFile: FilmsFile = {
    count: films.length,
    id: films.map((f) => f.id),
    title: films.map((f) => f.title),
    year: films.map((f) => f.year),
    length: films.map((f) => f.length),
    rating: films.map(() => 0), // Wikidata has no rating; see MetaFile.hasRating
    votes: films.map((f) => f.popularity),
    genreMask: genre.map((g) => g.mask),
    primaryGenre: genre.map((g) => g.primary),
    cert: films.map((f) => f.cert),
    country: films.map((f) => f.country),
    language: films.map((f) => f.language),
    poster: films.map((f) => f.poster),
  }

  const people: PeopleFile = {
    directors: directors.index,
    actors: actors.index,
    actresses: actresses.index,
  }

  const meta: MetaFile = {
    version: 3,
    buildDate,
    source: 'wikidata',
    sourceLabel: 'Wikidata sample (CC0)',
    attribution:
      'Film data from Wikidata (CC0). Images from Wikimedia Commons, each under its own licence.',
    hasRating: false,
    popularityLabel: 'Wikipedia editions',
    counts: {
      films: films.length,
      directors: people.directors.names.length,
      actors: people.actors.names.length,
      actresses: people.actresses.names.length,
    },
    legendGenres: [...LEGEND_GENRES],
    images: {
      poster: `${COMMONS_FILE_PATH}{path}?width=185`,
      avatar: `${COMMONS_FILE_PATH}{path}?width=48`,
    },
  }
  return { films: filmsFile, people, credits, meta }
}
