import type {
  CreditsFile,
  FilmsFile,
  MetaFile,
  PeopleFile,
} from '../../src/engine/schema.ts'
import {
  LEGEND_GENRES,
  MAX_ACTORS,
  MAX_ACTRESSES,
  MAX_DIRECTORS,
  MIN_VOTES,
  OTHER_GENRE,
} from './config.ts'
import { collationKey } from '../../src/engine/collation.ts'
import { lastFirst } from '../../src/engine/names.ts'
import { buildPeopleIndex, type PersonRecord } from './people.ts'
import {
  certCode,
  TMDB_IMAGE_BASE_URL,
  type PersonPhoto,
  type TmdbRecord,
} from './tmdb.ts'
import { NULL, parseFloatOrNull, parseIntOrNull, type Row } from './tsv.ts'

export { collationKey }

type Rows = AsyncIterable<Row> | Iterable<Row>

export interface Rating {
  rating: number
  votes: number
}

export interface Film {
  id: string
  title: string
  year: number
  length: number
  rating: number
  votes: number
  genres: string[]
}

export type Role = 'directors' | 'actors' | 'actresses'

const ROLE_BY_CATEGORY: Record<string, Role> = {
  director: 'directors',
  actor: 'actors',
  actress: 'actresses',
}
const ROLE_LIMIT: Record<Role, number> = {
  directors: MAX_DIRECTORS,
  actors: MAX_ACTORS,
  actresses: MAX_ACTRESSES,
}

/** Keep only ratings with enough votes; this keeps the map small (about 1.5M rows -> ~50k). */
export async function loadRatings(
  rows: Rows,
  minVotes = MIN_VOTES,
): Promise<Map<string, Rating>> {
  const ratings = new Map<string, Rating>()
  for await (const row of rows) {
    const rating = parseFloatOrNull(row.averageRating)
    const votes = parseIntOrNull(row.numVotes)
    if (rating === null || votes === null || votes < minVotes) continue
    ratings.set(row.tconst!, { rating, votes })
  }
  return ratings
}

/** Feature films with a year, runtime, at least one genre, and enough votes (DESIGN.md 4.2). */
export async function selectFilms(
  rows: Rows,
  ratings: Map<string, Rating>,
): Promise<Film[]> {
  const films: Film[] = []
  for await (const row of rows) {
    if (row.titleType !== 'movie') continue
    const r = ratings.get(row.tconst!)
    if (!r) continue
    const year = parseIntOrNull(row.startYear)
    const length = parseIntOrNull(row.runtimeMinutes)
    if (
      year === null ||
      length === null ||
      row.genres === NULL ||
      row.genres === ''
    )
      continue
    films.push({
      id: row.tconst!,
      title: row.primaryTitle!,
      year,
      length,
      rating: r.rating,
      votes: r.votes,
      genres: row.genres!.split(','),
    })
  }
  // Most-voted first: a stable order, and index 0 wins overplotting ties.
  films.sort((a, b) => b.votes - a.votes || (a.id < b.id ? -1 : 1))
  return films
}

export interface RawCredits {
  directors: string[][] // nconst lists per film index, billing order
  actors: string[][]
  actresses: string[][]
}

/** Up to 3 directors and the first 5 billed actors and actresses per film. */
export async function collectCredits(
  rows: Rows,
  filmIndex: Map<string, number>,
): Promise<RawCredits> {
  type Entry = { ordering: number; nconst: string }
  const n = filmIndex.size
  const found: Record<Role, Entry[][]> = {
    directors: Array.from({ length: n }, () => []),
    actors: Array.from({ length: n }, () => []),
    actresses: Array.from({ length: n }, () => []),
  }
  for await (const row of rows) {
    const role = ROLE_BY_CATEGORY[row.category ?? '']
    if (!role) continue
    const idx = filmIndex.get(row.tconst!)
    if (idx === undefined) continue
    found[role][idx]!.push({
      ordering: parseIntOrNull(row.ordering) ?? 0,
      nconst: row.nconst!,
    })
  }
  const trim = (role: Role): string[][] =>
    found[role].map((entries) =>
      entries
        .sort((a, b) => a.ordering - b.ordering)
        .slice(0, ROLE_LIMIT[role])
        .map((e) => e.nconst),
    )
  return {
    directors: trim('directors'),
    actors: trim('actors'),
    actresses: trim('actresses'),
  }
}

export function neededNconsts(credits: RawCredits): Set<string> {
  const needed = new Set<string>()
  for (const role of ['directors', 'actors', 'actresses'] as const) {
    for (const list of credits[role])
      for (const nconst of list) needed.add(nconst)
  }
  return needed
}

export async function resolveNames(
  rows: Rows,
  needed: Set<string>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for await (const row of rows) {
    if (
      needed.has(row.nconst!) &&
      row.primaryName &&
      row.primaryName !== NULL
    ) {
      names.set(row.nconst!, lastFirst(row.primaryName))
    }
  }
  return names
}

export function genreFields(genres: string[]): {
  mask: number
  primary: number
} {
  let mask = 0
  let primary = -1
  for (const genre of genres) {
    const bit = (LEGEND_GENRES as readonly string[]).indexOf(genre)
    if (bit === -1) {
      mask |= 1 << OTHER_GENRE
    } else {
      mask |= 1 << bit
      if (primary === -1) primary = bit
    }
  }
  return { mask, primary: primary === -1 ? OTHER_GENRE : primary }
}

/**
 * Match our credit names ("Last, First", from IMDb) to TMDB's people ("First Last")
 * by accent- and case-insensitive name. People TMDB has no photo for are left out.
 */
export function matchPhotos(
  names: string[],
  tmdbPeople: PersonPhoto[],
): Record<string, string> {
  const byKey = new Map<string, string>()
  for (const p of tmdbPeople) {
    const key = collationKey(lastFirst(p.name))
    if (!byKey.has(key)) byKey.set(key, p.profile)
  }
  const photos: Record<string, string> = {}
  for (const name of names) {
    const profile = byKey.get(collationKey(name))
    if (profile) photos[name] = profile
  }
  return photos
}

export interface Outputs {
  films: FilmsFile
  people: PeopleFile
  credits: CreditsFile
  meta: MetaFile
}

export function buildOutputs(
  films: Film[],
  credits: RawCredits,
  names: Map<string, string>,
  buildDate = new Date().toISOString(),
  /** TMDB data by IMDb id (certification, poster, language, country). Optional. */
  enrich: ReadonlyMap<string, TmdbRecord> = new Map(),
): Outputs {
  // People are identified by their IMDb id (nconst) throughout; names are only labels.
  const role = (lists: string[][]): PersonRecord[][] =>
    lists.map((ids) =>
      ids.flatMap((id) => {
        const name = names.get(id)
        return name ? [{ id, name, photo: null as string | null }] : []
      }),
    )
  const records = {
    directors: role(credits.directors),
    actors: role(credits.actors),
    actresses: role(credits.actresses),
  }

  // TMDB lists a film's people by name. Match them against this film's own credits, so a
  // photo can only land on someone credited on the film (and not on a namesake elsewhere).
  films.forEach((film, i) => {
    const record = enrich.get(film.id)
    if (!record) return
    const credited = [
      ...records.directors[i]!,
      ...records.actors[i]!,
      ...records.actresses[i]!,
    ]
    const photos = matchPhotos(
      credited.map((c) => c.name),
      [...record.directors, ...record.cast],
    )
    for (const c of credited) c.photo = photos[c.name] ?? null
  })

  const directors = buildPeopleIndex(records.directors)
  const actors = buildPeopleIndex(records.actors)
  const actresses = buildPeopleIndex(records.actresses)
  const creditsFile: CreditsFile = {
    directors: directors.credits,
    actors: actors.credits,
    actresses: actresses.credits,
  }

  const genreInfo = films.map((f) => genreFields(f.genres))
  const filmsFile: FilmsFile = {
    count: films.length,
    id: films.map((f) => f.id),
    title: films.map((f) => f.title),
    year: films.map((f) => f.year),
    length: films.map((f) => f.length),
    rating: films.map((f) => f.rating),
    votes: films.map((f) => f.votes),
    genreMask: genreInfo.map((g) => g.mask),
    primaryGenre: genreInfo.map((g) => g.primary),
    cert: films.map((f) => certCode(enrich.get(f.id)?.usCertification ?? null)),
    country: films.map((f) => enrich.get(f.id)?.countries[0] ?? ''),
    language: films.map((f) => enrich.get(f.id)?.language ?? ''),
    poster: films.map((f) => enrich.get(f.id)?.poster ?? null),
  }

  const people: PeopleFile = {
    directors: directors.index,
    actors: actors.index,
    actresses: actresses.index,
  }

  const meta: MetaFile = {
    version: 3,
    buildDate,
    source: 'imdb',
    sourceLabel: 'IMDb + TMDB',
    attribution:
      'Film data from IMDb (personal, non-commercial use). This product uses the TMDB API but is not endorsed or certified by TMDB.',
    hasRating: true,
    popularityLabel: 'votes',
    counts: {
      films: films.length,
      directors: people.directors.names.length,
      actors: people.actors.names.length,
      actresses: people.actresses.names.length,
    },
    legendGenres: [...LEGEND_GENRES],
    images:
      enrich.size > 0
        ? {
            poster: `${TMDB_IMAGE_BASE_URL}w185{path}`,
            avatar: `${TMDB_IMAGE_BASE_URL}w45{path}`,
          }
        : null,
  }

  return { films: filmsFile, people, credits: creditsFile, meta }
}
