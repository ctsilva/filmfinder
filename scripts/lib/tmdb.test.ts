import { describe, expect, test } from 'vitest'
import { certCode, NOT_FOUND, pickUsCertification, trimMovie } from './tmdb.ts'

const release = (certification: string, type: number) => ({
  certification,
  type,
})

describe('pickUsCertification', () => {
  test('prefers the theatrical US certification', () => {
    const results = [
      { iso_3166_1: 'GB', release_dates: [release('15', 3)] },
      {
        iso_3166_1: 'US',
        release_dates: [release('R', 5), release('PG-13', 3)],
      },
    ]
    expect(pickUsCertification(results)).toBe('PG-13')
  })

  test('ignores empty certifications and falls back to any rated release', () => {
    const results = [
      { iso_3166_1: 'US', release_dates: [release('', 3), release('R', 4)] },
    ]
    expect(pickUsCertification(results)).toBe('R')
  })

  test('null when there is no US entry or no certification', () => {
    expect(
      pickUsCertification([
        { iso_3166_1: 'FR', release_dates: [release('12', 3)] },
      ]),
    ).toBeNull()
    expect(
      pickUsCertification([
        { iso_3166_1: 'US', release_dates: [release('', 3)] },
      ]),
    ).toBeNull()
    expect(pickUsCertification(undefined)).toBeNull()
  })
})

describe('certCode', () => {
  test.each([
    ['G', 0],
    ['PG', 1],
    ['PG-13', 2],
    ['R', 3],
    ['pg-13', 2],
    ['NC-17', 4],
    ['NR', 4],
    ['Approved', 4],
    [null, 4],
  ])('%s -> %i', (raw, code) => {
    expect(certCode(raw)).toBe(code)
  })
})

describe('trimMovie', () => {
  test('keeps only what the app uses', () => {
    const record = trimMovie({
      id: 278,
      poster_path: '/abc.jpg',
      original_language: 'en',
      production_countries: [{ iso_3166_1: 'US' }, { iso_3166_1: 'GB' }],
      release_dates: {
        results: [{ iso_3166_1: 'US', release_dates: [release('R', 3)] }],
      },
      credits: {
        cast: [
          { name: 'Third Billed', profile_path: '/c.jpg', order: 2 },
          { name: 'No Photo', profile_path: null, order: 1 },
          { name: 'First Billed', profile_path: '/a.jpg', order: 0 },
        ],
        crew: [
          { name: 'Dir Ector', job: 'Director', profile_path: '/d.jpg' },
          { name: 'Some Writer', job: 'Writer', profile_path: '/w.jpg' },
        ],
      },
    })
    expect(record).toEqual({
      found: true,
      tmdbId: 278,
      poster: '/abc.jpg',
      language: 'en',
      countries: ['US', 'GB'],
      usCertification: 'R',
      directors: [{ name: 'Dir Ector', profile: '/d.jpg' }],
      // billing order, people without a photo and non-directors left out
      cast: [
        { name: 'First Billed', profile: '/a.jpg' },
        { name: 'Third Billed', profile: '/c.jpg' },
      ],
    })
  })

  test('copes with missing fields', () => {
    expect(trimMovie({ id: 1 })).toEqual({
      found: true,
      tmdbId: 1,
      poster: null,
      language: '',
      countries: [],
      usCertification: null,
      directors: [],
      cast: [],
    })
  })

  test('a film TMDB does not know about is marked not found', () => {
    expect(NOT_FOUND.found).toBe(false)
  })
})
