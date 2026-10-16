export const IMDB_BASE_URL = 'https://datasets.imdbws.com'
export const IMDB_FILES = [
  'title.basics.tsv.gz',
  'title.ratings.tsv.gz',
  'title.principals.tsv.gz',
  'name.basics.tsv.gz',
] as const

/** Re-download a raw file when it is older than this. */
export const MAX_RAW_AGE_DAYS = 30

export const MIN_VOTES = 1000
export const MAX_DIRECTORS = 3
export const MAX_ACTORS = 5
export const MAX_ACTRESSES = 5

/**
 * The nine legend genres, in display order. Index = bit position in genreMask
 * and value of primaryGenre. Index 9 is "other".
 */
export const LEGEND_GENRES = [
  'Drama',
  'Comedy',
  'Action',
  'Romance',
  'Horror',
  'Sci-Fi',
  'Mystery',
  'Documentary',
  'Animation',
] as const
export const OTHER_GENRE = LEGEND_GENRES.length

/** Certification codes. Everything is NR until TMDB enrichment (Milestone 7). */
export const CERT_NR = 4
