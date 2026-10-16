import type { Filter } from './filters.ts'
import type { FilmStore } from './store.ts'

/**
 * Holds the filters and the combined result mask. No React or DOM dependency.
 *
 * Usage: mutate a filter (filter.set / filter.clear), then call engine.recompute().
 */
export class QueryEngine {
  /** 1 if the film passes every active filter. */
  readonly resultMask: Uint8Array
  /** Number of films in resultMask. */
  count: number
  /** Bumped on every recompute, so views know when to redraw. */
  version = 0

  private readonly filters = new Map<string, Filter>()
  private readonly scratch: Uint8Array

  readonly store: FilmStore

  constructor(store: FilmStore) {
    this.store = store
    this.resultMask = new Uint8Array(store.count)
    this.scratch = new Uint8Array(store.count)
    this.count = store.count
    this.resultMask.fill(1)
  }

  addFilter<T extends Filter>(id: string, filter: T): T {
    this.filters.set(id, filter)
    return filter
  }

  filter<T extends Filter>(id: string): T {
    const filter = this.filters.get(id)
    if (!filter) throw new Error(`No filter named ${id}`)
    return filter as T
  }

  recompute(): void {
    this.count = this.combine(this.resultMask, undefined)
    this.version++
  }

  /**
   * Mask of films passing every active filter except `id`'s own.
   * This is the basis of tight coupling: a widget's valid values come from here.
   * The returned array is reused by the next call.
   */
  maskExcluding(id: string): Uint8Array {
    this.combine(this.scratch, id)
    return this.scratch
  }

  /** Min and max of a column over the films in maskExcluding(id), or null if none. */
  validRange(
    id: string,
    column: ArrayLike<number>,
  ): { min: number; max: number } | null {
    const mask = this.maskExcluding(id)
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) continue
      const v = column[i]!
      if (v < min) min = v
      if (v > max) max = v
    }
    return min === Infinity ? null : { min, max }
  }

  /**
   * Sorted distinct values of a column among the films in maskExcluding(id): the values a
   * range slider can actually offer.
   */
  presentValues(id: string, column: ArrayLike<number>): number[] {
    const mask = this.maskExcluding(id)
    const seen = new Set<number>()
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 0) seen.add(column[i]!)
    }
    return [...seen].sort((a, b) => a - b)
  }

  /** OR of a bit column over the films in maskExcluding(id): which cert or genre bits still occur. */
  validBits(id: string, bits: ArrayLike<number>): number {
    const mask = this.maskExcluding(id)
    let seen = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 0) seen |= bits[i]!
    }
    return seen
  }

  /**
   * For an inverted index (films[k] = film indexes of name k), 1 if name k has
   * at least one film in maskExcluding(id).
   */
  validNames(id: string, films: readonly (readonly number[])[]): Uint8Array {
    const mask = this.maskExcluding(id)
    const valid = new Uint8Array(films.length)
    for (let k = 0; k < films.length; k++) {
      const list = films[k]!
      for (let j = 0; j < list.length; j++) {
        if (mask[list[j]!] !== 0) {
          valid[k] = 1
          break
        }
      }
    }
    return valid
  }

  /** AND all active filter masks (except `skip`) into `out`. Returns the number of set entries. */
  private combine(out: Uint8Array, skip: string | undefined): number {
    let first = true
    for (const [id, filter] of this.filters) {
      if (id === skip || !filter.active) continue
      if (first) {
        out.set(filter.mask)
        first = false
      } else {
        const m = filter.mask
        for (let i = 0; i < out.length; i++) out[i] = out[i]! & m[i]!
      }
    }
    if (first) out.fill(1)
    let count = 0
    for (let i = 0; i < out.length; i++) count += out[i]!
    return count
  }
}
