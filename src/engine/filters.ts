/**
 * A filter owns a pass mask: mask[i] is 1 if film i passes this filter alone.
 * An inactive filter passes everything and is skipped by the engine.
 */
export interface Filter {
  readonly mask: Uint8Array
  readonly active: boolean
  clear(): void
}

/** Inclusive numeric range over one column (year, length, rating10, votes). */
export class RangeFilter implements Filter {
  readonly mask: Uint8Array
  active = false

  private readonly column: ArrayLike<number>

  constructor(column: ArrayLike<number>) {
    this.column = column
    this.mask = new Uint8Array(column.length)
  }

  set(min: number, max: number): void {
    const { column, mask } = this
    for (let i = 0; i < mask.length; i++) {
      const v = column[i]!
      mask[i] = v >= min && v <= max ? 1 : 0
    }
    this.active = true
  }

  clear(): void {
    this.active = false
  }
}

/**
 * Passes films whose bit column shares at least one bit with the allowed set.
 * Used for certification (one bit per film) and genre (any-of-the-film's-genres).
 */
export class MaskFilter implements Filter {
  readonly mask: Uint8Array
  active = false

  private readonly bits: ArrayLike<number>

  constructor(bits: ArrayLike<number>) {
    this.bits = bits
    this.mask = new Uint8Array(bits.length)
  }

  set(allowed: number): void {
    const { bits, mask } = this
    for (let i = 0; i < mask.length; i++) {
      mask[i] = (bits[i]! & allowed) !== 0 ? 1 : 0
    }
    this.active = true
  }

  clear(): void {
    this.active = false
  }
}

/** Passes an explicit set of film indexes, e.g. one person's films from the inverted index. */
export class SetFilter implements Filter {
  readonly mask: Uint8Array
  active = false

  constructor(count: number) {
    this.mask = new Uint8Array(count)
  }

  set(films: ArrayLike<number>): void {
    this.mask.fill(0)
    for (let i = 0; i < films.length; i++) this.mask[films[i]!] = 1
    this.active = true
  }

  clear(): void {
    this.active = false
  }
}
