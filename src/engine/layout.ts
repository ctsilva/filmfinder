import type { FilmStore } from './store.ts'

export type YAxis = 'rating' | 'votes'

export interface StarLayout {
  xs: Float32Array
  ys: Float32Array
}

/** Cheap deterministic hash to [0, 1), so jitter is stable between renders. */
export function hash01(i: number): number {
  let t = (Math.imul(i + 1, 0x9e3779b1) ^ 0x85ebca6b) >>> 0
  t = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d) >>> 0
  t = Math.imul(t ^ (t >>> 12), 0x297a2d39) >>> 0
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296
}

/**
 * Data-space position of each star.
 *
 * The data gives a whole year, a rating to one decimal, and popularity as a whole
 * number, so thousands of films share an exact point, and on the popularity axis
 * small counts (30, 31, 32 Wikipedia editions) would line up in visible rows.
 * We spread them within their year (x in [year, year+1)), within +-0.05 of their
 * rating, and within +-0.5 of their popularity count, so zooming can tell them apart.
 */
export function computeLayout(store: FilmStore, yAxis: YAxis): StarLayout {
  const xs = new Float32Array(store.count)
  const ys = new Float32Array(store.count)
  for (let i = 0; i < store.count; i++) {
    xs[i] = store.year[i]! + hash01(i)
    ys[i] =
      yAxis === 'rating'
        ? store.rating10[i]! / 10 + (hash01(i + 1_000_003) - 0.5) * 0.1
        : store.votes[i]! + (hash01(i + 1_000_003) - 0.5)
  }
  return { xs, ys }
}
