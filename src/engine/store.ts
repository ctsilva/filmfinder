import type { FilmsFile } from './schema.ts'

/**
 * Film attributes as typed arrays, one entry per film index.
 *
 * Rating is kept in tenths (0-100) as an integer. Float32 would turn 7.1 into
 * 7.0999999, and a range filter with bound 7.1 would then wrongly exclude it.
 */
export class FilmStore {
  readonly count: number
  readonly year: Int16Array
  readonly length: Int16Array
  readonly rating10: Uint8Array
  readonly votes: Int32Array
  readonly genreMask: Uint16Array
  readonly primaryGenre: Uint8Array
  /** 1 << primaryGenre: the genre a star is coloured by, as a bit for MaskFilter. */
  readonly primaryBit: Uint16Array
  readonly cert: Uint8Array
  /** 1 << cert, so a cert checkbox set can be tested with a bitwise AND. */
  readonly certBit: Uint8Array

  constructor(file: FilmsFile) {
    this.count = file.count
    this.year = Int16Array.from(file.year)
    this.length = Int16Array.from(file.length)
    this.rating10 = Uint8Array.from(file.rating, (r) => Math.round(r * 10))
    this.votes = Int32Array.from(file.votes)
    this.genreMask = Uint16Array.from(file.genreMask)
    this.primaryGenre = Uint8Array.from(file.primaryGenre)
    this.primaryBit = Uint16Array.from(file.primaryGenre, (g) => 1 << g)
    this.cert = Uint8Array.from(file.cert)
    this.certBit = Uint8Array.from(file.cert, (c) => 1 << c)
  }
}
