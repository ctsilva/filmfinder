import { expect, test } from 'vitest'
import { imageUrl, normalizeMeta } from './meta.ts'

test('an old meta.json (no source fields) is treated as an IMDb + TMDB build', () => {
  const meta = normalizeMeta({
    version: 1,
    buildDate: 'x',
    counts: { films: 3, directors: 1, actors: 2, actresses: 1 },
    legendGenres: ['Drama'],
    tmdbImageBaseUrl: 'https://image.tmdb.org/t/p/',
  })
  expect(meta).toMatchObject({
    source: 'imdb',
    hasRating: true,
    popularityLabel: 'votes',
  })
  expect(meta.images).toEqual({
    poster: 'https://image.tmdb.org/t/p/w185{path}',
    avatar: 'https://image.tmdb.org/t/p/w45{path}',
  })
})

test('an old meta.json without TMDB data has no images', () => {
  expect(normalizeMeta({ tmdbImageBaseUrl: null }).images).toBeNull()
})

test('a current meta.json is kept as it is', () => {
  const meta = normalizeMeta({
    source: 'wikidata',
    hasRating: false,
    popularityLabel: 'Wikipedia editions',
    images: null,
  })
  expect(meta).toMatchObject({
    source: 'wikidata',
    hasRating: false,
    popularityLabel: 'Wikipedia editions',
    images: null,
  })
})

test('imageUrl fills the {path} placeholder', () => {
  expect(imageUrl('https://x.org/w185{path}', '/a.jpg')).toBe(
    'https://x.org/w185/a.jpg',
  )
  expect(imageUrl('https://x.org/FilePath/{path}?width=48', 'A%20B.jpg')).toBe(
    'https://x.org/FilePath/A%20B.jpg?width=48',
  )
})
