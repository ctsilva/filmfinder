/** Shapes of the static data files in public/data/. See DESIGN.md section 4.4. */

export interface FilmsFile {
  count: number
  id: string[] // IMDb tconst
  title: string[]
  year: number[]
  length: number[] // minutes
  rating: number[] // 0-10, one decimal
  votes: number[]
  genreMask: number[] // bits 0-8 = legend genres, bit 9 = other
  primaryGenre: number[] // 0-8 legend genre, 9 = other
  cert: number[] // 0=G 1=PG 2=PG-13 3=R 4=NR (US certification from TMDB; NR if unknown)
  /** First production country, ISO 3166-1 code ("US"), or "" if unknown. Format with Intl.DisplayNames. */
  country: string[]
  /** Original language, ISO 639-1 code ("en"), or "". */
  language: string[]
  /** TMDB poster path (append to tmdbImageBaseUrl + size), or null. */
  poster: (string | null)[]
}

export interface PeopleIndex {
  /**
   * Display names, sorted by collation key. Each entry is one person, so two different
   * people with the same name appear as two entries.
   */
  names: string[]
  /** films[i] lists film indexes (into FilmsFile) for person i, ascending. */
  films: number[][]
  /** Photo path for person i (see MetaFile.images), or null. Absent for lists that are not people. */
  photos?: (string | null)[]
}

export interface PeopleFile {
  directors: PeopleIndex
  actors: PeopleIndex
  actresses: PeopleIndex
}

/**
 * Per film, who is credited, in billing order, as indexes into the matching
 * PeopleFile list (directors, actors, actresses). Loaded lazily by the detail card.
 */
export interface CreditsFile {
  directors: number[][]
  actors: number[][]
  actresses: number[][]
}

export interface MetaFile {
  version: number
  buildDate: string
  /** Where the data came from. */
  source: 'imdb' | 'wikidata'
  /** Short name shown in the interface. */
  sourceLabel: string
  /** Credit line shown in the footer. */
  attribution: string
  /** False when the source has no rating; FilmsFile.rating is then unused. */
  hasRating: boolean
  /** What FilmsFile.votes measures: "votes" for IMDb, "Wikipedia editions" for Wikidata. */
  popularityLabel: string
  counts: {
    films: number
    directors: number
    actors: number
    actresses: number
  }
  legendGenres: string[]
  /** URL templates containing {path} (a poster or photo path), or null if the dataset has no images. */
  images: { poster: string; avatar: string } | null
}
