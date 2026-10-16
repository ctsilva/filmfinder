import { create } from 'zustand'
import { QueryEngine } from '../engine/engine.ts'
import type {
  CreditsFile,
  FilmsFile,
  MetaFile,
  PeopleFile,
} from '../engine/schema.ts'
import { FilmStore } from '../engine/store.ts'
import type { YAxis } from '../engine/layout.ts'
import { normalizeMeta } from '../engine/meta.ts'
import { buildTitleIndex } from '../engine/titles.ts'
import {
  addQueryFilters,
  applyQuery,
  INITIAL_QUERY,
  personQuery,
  type AlphaIndexes,
  type AlphaKind,
  type QueryState,
} from './queryState.ts'

/** The data folder was built by an older version of the build scripts and must be rebuilt. */
class OutdatedDataError extends Error {}

/** Oldest data format the app understands: people have ids, credits point to people by index. */
const MIN_DATA_VERSION = 3

/** Loading state of a resource that arrives after the films (the people lists, the cast lists). */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AppState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  films: FilmsFile | null
  meta: MetaFile | null
  /** Folder the dataset was loaded from: /data/ (built from IMDb) or /sample-data/ (Wikidata). */
  dataBase: string
  /** A fixable problem worth telling the user about, such as outdated data that was skipped. */
  notice: string | null
  engine: QueryEngine | null
  /** Mirrors engine.version; components subscribe to this to redraw. */
  version: number
  yAxis: YAxis
  query: QueryState
  /** Sorted name lists with film indexes, one per alphaslider. People load after the films. */
  indexes: AlphaIndexes
  /** Cast lists for the detail card, loaded the first time a film is opened. */
  credits: CreditsFile | null
  peopleStatus: LoadStatus
  creditsStatus: LoadStatus
  hovered: number
  selected: number
  selectedVia: 'pointer' | 'list'
  load: () => Promise<void>
  loadPeople: () => Promise<void>
  loadCredits: () => Promise<void>
  /** Associative search: query that person's films, clearing every other filter. */
  selectPerson: (kind: 'actor' | 'actress' | 'director', person: number) => void
  bump: () => void
  setYAxis: (axis: YAxis) => void
  setQuery: (patch: Partial<QueryState>) => void
  setAlpha: (kind: AlphaKind, name: number | null) => void
  setHovered: (film: number) => void
  /** `via` is 'list' when a film was chosen from the results list, so focus can return to it. */
  setSelected: (film: number, via?: 'pointer' | 'list') => void
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  // A dev server answers unknown paths with index.html (HTTP 200), so a parse failure means "not there".
  try {
    return (await res.json()) as T
  } catch {
    throw new Error(`${url}: not found`)
  }
}

const DATASETS = ['/data/', '/sample-data/']

async function fetchDataset(
  base: string,
): Promise<{ films: FilmsFile; meta: MetaFile }> {
  const [films, meta] = await Promise.all([
    fetchJson<FilmsFile>(`${base}films.json`),
    fetchJson<Partial<MetaFile>>(`${base}meta.json`),
  ])
  if (typeof films.count !== 'number')
    throw new Error(`${base}films.json: not a dataset`)
  const normalized = normalizeMeta(meta)
  if (normalized.version < MIN_DATA_VERSION) {
    throw new OutdatedDataError(
      `The data in ${base} was built by an older version. Run the build again.`,
    )
  }
  return { films, meta: normalized }
}

/**
 * Use the full dataset built from IMDb if there is one, otherwise the Wikidata
 * sample that ships with the repository. `?data=sample` forces the sample.
 */
async function loadDataset(): Promise<{
  base: string
  films: FilmsFile
  meta: MetaFile
  /** Set when a dataset was skipped for a reason the user can fix. */
  notice: string | null
}> {
  const forced = new URLSearchParams(window.location.search).get('data')
  const candidates = forced === 'sample' ? ['/sample-data/'] : DATASETS
  let lastError: unknown = null
  let notice: string | null = null
  for (const base of candidates) {
    try {
      return { base, notice, ...(await fetchDataset(base)) }
    } catch (err) {
      lastError = err
      if (err instanceof OutdatedDataError) {
        notice = `The data in ${base} was built by an older version of the build scripts, so another dataset is shown. Run \`npm run build-data\` again to use it.`
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No dataset found')
}

let applyScheduled = false

function scheduleApply(get: () => AppState): void {
  if (applyScheduled) return
  applyScheduled = true
  requestAnimationFrame(() => {
    applyScheduled = false
    const { engine, query, indexes, bump } = get()
    if (!engine) return
    applyQuery(engine, query, indexes)
    bump()
  })
}

export const useApp = create<AppState>((set, get) => ({
  status: 'idle',
  error: null,
  films: null,
  meta: null,
  dataBase: '/data/',
  notice: null,
  engine: null,
  version: 0,
  yAxis: 'rating',
  query: INITIAL_QUERY,
  indexes: {},
  credits: null,
  peopleStatus: 'idle',
  creditsStatus: 'idle',
  hovered: -1,
  selected: -1,
  selectedVia: 'pointer',

  load: async () => {
    if (get().status !== 'idle') return
    set({ status: 'loading' })
    try {
      const { base, films, meta, notice } = await loadDataset()
      const store = new FilmStore(films)
      const engine = new QueryEngine(store)
      addQueryFilters(engine, store)
      engine.recompute()
      set({
        status: 'ready',
        films,
        meta,
        dataBase: base,
        notice,
        // A dataset without ratings (Wikidata) plots popularity on the Y axis.
        yAxis: meta.hasRating ? 'rating' : 'votes',
        engine,
        version: engine.version,
        indexes: { title: buildTitleIndex(films) },
      })
      void get().loadPeople()
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  // Both loaders can be called again after a failure (the Retry buttons do exactly that).
  loadPeople: async () => {
    const status = get().peopleStatus
    if (status === 'loading' || status === 'ready') return
    set({ peopleStatus: 'loading' })
    try {
      const people = await fetchJson<PeopleFile>(`${get().dataBase}people.json`)
      set({
        peopleStatus: 'ready',
        indexes: {
          ...get().indexes,
          director: people.directors,
          actor: people.actors,
          actress: people.actresses,
        },
      })
    } catch (err) {
      console.error('Could not load people.json', err)
      set({ peopleStatus: 'error' })
    }
  },

  loadCredits: async () => {
    const status = get().creditsStatus
    if (status === 'loading' || status === 'ready') return
    set({ creditsStatus: 'loading' })
    try {
      const credits = await fetchJson<CreditsFile>(
        `${get().dataBase}credits.json`,
      )
      set({ credits, creditsStatus: 'ready' })
    } catch (err) {
      console.error('Could not load credits.json', err)
      set({ creditsStatus: 'error' })
    }
  },

  selectPerson: (kind, person) => {
    if (!get().indexes[kind]) return
    set({ query: personQuery(kind, person), selected: -1 })
    scheduleApply(get)
  },

  bump: () => {
    const engine = get().engine
    if (engine) set({ version: engine.version })
  },
  setYAxis: (yAxis) => set({ yAxis }),
  // Widget state updates immediately; the filters and result are recomputed
  // at most once per animation frame, however fast a slider fires events.
  setAlpha: (kind, name) => {
    get().setQuery({ alpha: { ...get().query.alpha, [kind]: name } })
  },
  setQuery: (patch) => {
    set({ query: { ...get().query, ...patch } })
    scheduleApply(get)
  },
  setHovered: (hovered) => {
    if (get().hovered !== hovered) set({ hovered })
  },
  setSelected: (selected, via = 'pointer') =>
    set({ selected, selectedVia: via }),
}))
