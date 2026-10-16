import type { MetaFile } from './schema.ts'

const TMDB_IMAGES = 'https://image.tmdb.org/t/p/'

/**
 * Fill in the fields older builds of meta.json lack, so a data folder built
 * before the Wikidata source existed still loads (it is always an IMDb + TMDB build).
 */
export function normalizeMeta(
  raw: Partial<MetaFile> & { tmdbImageBaseUrl?: string | null },
): MetaFile {
  const images =
    raw.images !== undefined
      ? raw.images
      : raw.tmdbImageBaseUrl
        ? {
            poster: `${TMDB_IMAGES}w185{path}`,
            avatar: `${TMDB_IMAGES}w45{path}`,
          }
        : null
  return {
    version: raw.version ?? 1,
    buildDate: raw.buildDate ?? '',
    source: raw.source ?? 'imdb',
    sourceLabel: raw.sourceLabel ?? 'IMDb + TMDB',
    attribution:
      raw.attribution ??
      'Film data from IMDb (personal, non-commercial use). This product uses the TMDB API but is not endorsed or certified by TMDB.',
    hasRating: raw.hasRating ?? true,
    popularityLabel: raw.popularityLabel ?? 'votes',
    counts: raw.counts ?? { films: 0, directors: 0, actors: 0, actresses: 0 },
    legendGenres: raw.legendGenres ?? [],
    images,
  }
}

/** Fill a URL template such as "https://example.org/w185{path}" with a poster or photo path. */
export function imageUrl(template: string, path: string): string {
  return template.replace('{path}', path)
}
