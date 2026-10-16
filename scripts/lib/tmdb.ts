/** TMDB helpers for Milestone 7: fetching, trimming, and normalizing certifications. */

export const TMDB_API = 'https://api.themoviedb.org/3'
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/'

/** Certification codes used by the app (see FilmsFile.cert). Anything else is NR. */
export const CERT_CODES: Record<string, number> = {
  G: 0,
  PG: 1,
  'PG-13': 2,
  R: 3,
}
export const CERT_NR = 4

/** A person from TMDB's credits who has a photo. Names are TMDB's ("First Last"). */
export interface PersonPhoto {
  name: string
  profile: string
}

/** What we keep from TMDB for one film. */
export interface TmdbRecord {
  /** False if TMDB has no entry for this IMDb id. */
  found: boolean
  tmdbId: number | null
  poster: string | null
  /** ISO 639-1 original language code, e.g. "en". */
  language: string
  /** ISO 3166-1 production country codes, e.g. ["US", "GB"]. */
  countries: string[]
  /** Raw US certification as TMDB gives it, or null. */
  usCertification: string | null
  /** Directors and top-billed cast that have a photo (others are left out). */
  directors: PersonPhoto[]
  cast: PersonPhoto[]
}

interface ReleaseDateEntry {
  certification?: string
  type?: number
}
interface ReleaseDatesResult {
  iso_3166_1: string
  release_dates?: ReleaseDateEntry[]
}
export interface TmdbMovie {
  id: number
  poster_path?: string | null
  original_language?: string
  production_countries?: { iso_3166_1: string }[]
  release_dates?: { results?: ReleaseDatesResult[] }
  credits?: {
    cast?: { name: string; profile_path?: string | null; order?: number }[]
    crew?: { name: string; job?: string; profile_path?: string | null }[]
  }
}

/** How many billed cast members to keep photos for; our cards list at most 5 actors and 5 actresses. */
const MAX_CAST_PHOTOS = 14
const MAX_DIRECTOR_PHOTOS = 3

/** TMDB release types in order of preference: theatrical, limited theatrical, premiere, then the rest. */
const TYPE_PREFERENCE = [3, 2, 1, 4, 5, 6]

export function pickUsCertification(
  results: ReleaseDatesResult[] | undefined,
): string | null {
  const us = results?.find((r) => r.iso_3166_1 === 'US')
  if (!us?.release_dates) return null
  const rated = us.release_dates.filter(
    (d) => d.certification && d.certification.trim() !== '',
  )
  for (const type of TYPE_PREFERENCE) {
    const hit = rated.find((d) => d.type === type)
    if (hit) return hit.certification!.trim()
  }
  return rated[0]?.certification?.trim() ?? null
}

export function trimMovie(movie: TmdbMovie): TmdbRecord {
  const cast = [...(movie.credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, MAX_CAST_PHOTOS)
  const directors = (movie.credits?.crew ?? []).filter(
    (c) => c.job === 'Director',
  )
  const withPhoto = (
    people: { name: string; profile_path?: string | null }[],
  ): PersonPhoto[] =>
    people.flatMap((p) =>
      p.profile_path ? [{ name: p.name, profile: p.profile_path }] : [],
    )
  return {
    found: true,
    tmdbId: movie.id,
    poster: movie.poster_path ?? null,
    language: movie.original_language ?? '',
    countries: (movie.production_countries ?? []).map((c) => c.iso_3166_1),
    usCertification: pickUsCertification(movie.release_dates?.results),
    directors: withPhoto(directors.slice(0, MAX_DIRECTOR_PHOTOS)),
    cast: withPhoto(cast),
  }
}

export const NOT_FOUND: TmdbRecord = {
  found: false,
  tmdbId: null,
  poster: null,
  language: '',
  countries: [],
  usCertification: null,
  directors: [],
  cast: [],
}

/** G, PG, PG-13, R map to 0-3. NC-17, unrated, "Approved", missing: NR. */
export function certCode(raw: string | null): number {
  return raw === null ? CERT_NR : (CERT_CODES[raw.toUpperCase()] ?? CERT_NR)
}

// ---- Network -------------------------------------------------------------------------------

export interface TmdbAuth {
  token?: string
  apiKey?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Spaces request starts evenly so we stay under `perSecond`. */
export function makeLimiter(perSecond: number): () => Promise<void> {
  const gap = 1000 / perSecond
  let next = Date.now()
  return async () => {
    const now = Date.now()
    const at = Math.max(now, next)
    next = at + gap
    if (at > now) await sleep(at - now)
  }
}

export class TmdbAuthError extends Error {}

/** GET a TMDB path. Returns null on 404. Retries rate limits and server errors. */
export async function tmdbGet<T>(
  path: string,
  auth: TmdbAuth,
  limit: () => Promise<void>,
): Promise<T | null> {
  const url = new URL(TMDB_API + path)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (auth.token) headers.authorization = `Bearer ${auth.token}`
  else if (auth.apiKey) url.searchParams.set('api_key', auth.apiKey)

  for (let attempt = 0; ; attempt++) {
    await limit()
    let res: Response
    try {
      res = await fetch(url, { headers })
    } catch (err) {
      if (attempt >= 5) throw err
      await sleep(1000 * 2 ** attempt)
      continue
    }
    if (res.status === 404) return null
    if (res.status === 401)
      throw new TmdbAuthError('TMDB rejected the credentials (HTTP 401)')
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 6)
        throw new Error(`TMDB ${path}: HTTP ${res.status} after retries`)
      const wait = Number(res.headers.get('retry-after')) || 2 ** attempt
      await sleep(wait * 1000)
      continue
    }
    if (!res.ok) throw new Error(`TMDB ${path}: HTTP ${res.status}`)
    return (await res.json()) as T
  }
}

/** Look up one film by IMDb id: directly, falling back to /find. */
export async function fetchFilm(
  tconst: string,
  auth: TmdbAuth,
  limit: () => Promise<void>,
): Promise<TmdbRecord> {
  const append = '?append_to_response=release_dates,credits'
  const direct = await tmdbGet<TmdbMovie>(
    `/movie/${tconst}${append}`,
    auth,
    limit,
  )
  if (direct && typeof direct.id === 'number') return trimMovie(direct)

  const found = await tmdbGet<{ movie_results?: { id: number }[] }>(
    `/find/${tconst}?external_source=imdb_id`,
    auth,
    limit,
  )
  const id = found?.movie_results?.[0]?.id
  if (id === undefined) return NOT_FOUND
  const movie = await tmdbGet<TmdbMovie>(`/movie/${id}${append}`, auth, limit)
  return movie ? trimMovie(movie) : NOT_FOUND
}
