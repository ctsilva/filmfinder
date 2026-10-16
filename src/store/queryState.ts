import type { QueryEngine } from '../engine/engine.ts'
import { MaskFilter, RangeFilter, SetFilter } from '../engine/filters.ts'
import type { PeopleIndex } from '../engine/schema.ts'
import type { FilmStore } from '../engine/store.ts'

/** Slider span in minutes. A thumb at an end stop means "no limit" on that side. */
export const LENGTH_LO = 60
export const LENGTH_HI = 240

/** Year slider span. A thumb at an end stop means no limit (films from 1906 to 2026 exist). */
export const YEAR_LO = 1920
export const YEAR_HI = 2025

export const CERT_LABELS = ['G', 'PG', 'PG-13', 'R', 'NR'] as const
export const ALL_CERTS = (1 << CERT_LABELS.length) - 1

/** Nine legend genres plus "Other" (bit 9). */
export const GENRE_COUNT = 10
export const ALL_GENRES = (1 << GENRE_COUNT) - 1

export const ALPHA_KINDS = ['title', 'actor', 'actress', 'director'] as const
export type AlphaKind = (typeof ALPHA_KINDS)[number]
export type AlphaIndexes = Partial<Record<AlphaKind, PeopleIndex>>

/** What the user has asked for, independent of the engine. */
export interface QueryState {
  /** [min, max] minutes, or null for no length filter. */
  length: [number, number] | null
  /** [min, max] release year, or null for no year filter. */
  year: [number, number] | null
  /** Bitmask of checked certifications (bit = cert code). */
  certs: number
  /** Bitmask of enabled genres (bit = legend index, 9 = other). */
  genres: number
  /** Selected name index per alphaslider, or null for ALL. */
  alpha: Record<AlphaKind, number | null>
}

export const INITIAL_QUERY: QueryState = {
  length: null,
  year: null,
  certs: ALL_CERTS,
  genres: ALL_GENRES,
  alpha: { title: null, actor: null, actress: null, director: null },
}

export function addQueryFilters(engine: QueryEngine, store: FilmStore): void {
  engine.addFilter('length', new RangeFilter(store.length))
  engine.addFilter('year', new RangeFilter(store.year))
  engine.addFilter('cert', new MaskFilter(store.certBit))
  // Match the genre a star is coloured by, so each legend chip shows and hides exactly its colour.
  engine.addFilter('genre', new MaskFilter(store.primaryBit))
  for (const kind of ALPHA_KINDS)
    engine.addFilter(kind, new SetFilter(store.count))
}

/** A thumb at an end stop means no limit on that side; both at the stops means no filter. */
function applyRange(
  filter: RangeFilter,
  value: [number, number] | null,
  lo: number,
  hi: number,
): void {
  if (value === null || (value[0] <= lo && value[1] >= hi)) {
    filter.clear()
    return
  }
  filter.set(
    value[0] <= lo ? -Infinity : value[0],
    value[1] >= hi ? Infinity : value[1],
  )
}

/** Push the query state into the engine's filters and recompute. */
export function applyQuery(
  engine: QueryEngine,
  q: QueryState,
  indexes: AlphaIndexes = {},
): void {
  applyRange(
    engine.filter<RangeFilter>('length'),
    q.length,
    LENGTH_LO,
    LENGTH_HI,
  )
  applyRange(engine.filter<RangeFilter>('year'), q.year, YEAR_LO, YEAR_HI)

  const cert = engine.filter<MaskFilter>('cert')
  if (q.certs === ALL_CERTS) cert.clear()
  else cert.set(q.certs)

  const genre = engine.filter<MaskFilter>('genre')
  if (q.genres === ALL_GENRES) genre.clear()
  else genre.set(q.genres)

  for (const kind of ALPHA_KINDS) {
    const filter = engine.filter<SetFilter>(kind)
    const selected = q.alpha[kind]
    const index = indexes[kind]
    if (selected === null || !index) filter.clear()
    else filter.set(index.films[selected]!)
  }

  engine.recompute()
}

/**
 * Associative search: start a new query from one person. Every other filter is
 * cleared, so the result is that person's whole filmography, not just the part
 * that fits the previous query.
 */
export function personQuery(
  kind: Exclude<AlphaKind, 'title'>,
  nameIndex: number,
): QueryState {
  return {
    ...INITIAL_QUERY,
    alpha: { ...INITIAL_QUERY.alpha, [kind]: nameIndex },
  }
}
