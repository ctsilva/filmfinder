import { collationKey } from './collation.ts'

/**
 * Pure logic behind the alphaslider (no DOM). See Ahlberg & Shneiderman,
 * "The Alphaslider: A Compact and Rapid Selector" (CHI '94).
 *
 * The slider browses one long sorted list and selects a single name. Only
 * "valid" names, those with at least one film left after the other widgets'
 * filters, can be reached, so the user never lands on an empty result.
 *
 * The track maps linearly onto the valid names: every pixel covers about the
 * same number of names. The letter index under the track is spaced in
 * proportion to how many valid names start with each letter.
 */

export interface AlphaLayout {
  /** Letters that start at least one name, in order: # (non-letters) then A-Z. */
  letters: string[]
  /** Letter index of each name. */
  bucket: Uint8Array
}

export interface AlphaModel {
  layout: AlphaLayout
  /** Global indexes of the valid names, grouped by letter, ascending within a letter. */
  validIdx: Int32Array
  /** Letter s occupies validIdx[start[s] .. start[s + 1]). Length = letters + 1. */
  start: Int32Array
}

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

export function letterOf(name: string): string {
  const c = collationKey(name).charAt(0)
  return c >= 'a' && c <= 'z' ? c.toUpperCase() : '#'
}

/** Depends only on the name list, so compute once per list. */
export function computeAlphaLayout(names: readonly string[]): AlphaLayout {
  const perName = names.map(letterOf)
  const present = new Set(perName)
  const letters = LETTERS.filter((l) => present.has(l))
  const segment = new Map(letters.map((l, i) => [l, i]))
  return { letters, bucket: Uint8Array.from(perName, (l) => segment.get(l)!) }
}

/** valid[i] is 1 if name i currently has at least one film. */
export function buildAlphaModel(
  layout: AlphaLayout,
  valid: Uint8Array,
): AlphaModel {
  const k = layout.letters.length
  const start = new Int32Array(k + 1)
  for (let i = 0; i < valid.length; i++)
    if (valid[i]) start[layout.bucket[i]! + 1]!++
  for (let s = 0; s < k; s++) start[s + 1]! += start[s]!
  const validIdx = new Int32Array(start[k]!)
  const cursor = start.slice(0, k)
  for (let i = 0; i < valid.length; i++) {
    if (valid[i]) validIdx[cursor[layout.bucket[i]!]!++] = i
  }
  return { layout, validIdx, start }
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

/** First position in validIdx[start[s]..start[s+1]) holding a value >= nameIdx. */
function lowerBound(m: AlphaModel, s: number, nameIdx: number): number {
  let lo = m.start[s]!
  let hi = m.start[s + 1]!
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (m.validIdx[mid]! < nameIdx) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Where a name sits in the valid list. For a name that is not itself valid,
 * `ord` is where it would be inserted and `exact` is false.
 */
export function ordinalOf(
  m: AlphaModel,
  nameIdx: number,
): { ord: number; exact: boolean } {
  const s = m.layout.bucket[nameIdx]!
  const ord = lowerBound(m, s, nameIdx)
  return { ord, exact: ord < m.start[s + 1]! && m.validIdx[ord] === nameIdx }
}

/** Fractional position of a name in the valid list (an invalid name sits between its neighbours). */
function ordinalOfFractional(m: AlphaModel, nameIdx: number): number {
  const { ord, exact } = ordinalOf(m, nameIdx)
  return exact ? ord : ord - 0.5
}

/** Track position p (0..1) -> name index, or -1 if no name is valid. */
export function positionToIndex(m: AlphaModel, p: number): number {
  const n = m.validIdx.length
  if (n === 0) return -1
  return m.validIdx[Math.round(clamp(p, 0, 1) * (n - 1))]!
}

/** Name index -> track position (0..1), the inverse of positionToIndex for valid names. */
export function indexToPosition(m: AlphaModel, nameIdx: number): number {
  const n = m.validIdx.length
  if (n <= 1) return 0
  return clamp(ordinalOfFractional(m, nameIdx) / (n - 1), 0, 1)
}

/**
 * Letter index spans along the track, for drawing the index. Each letter's
 * share of the track is proportional to how many valid names start with it;
 * letters with no valid names are left out.
 */
export function letterSpans(
  m: AlphaModel,
): { letter: string; from: number; to: number }[] {
  const n = m.validIdx.length
  const spans: { letter: string; from: number; to: number }[] = []
  if (n === 0) return spans
  m.layout.letters.forEach((letter, s) => {
    if (m.start[s + 1]! > m.start[s]!) {
      spans.push({ letter, from: m.start[s]! / n, to: m.start[s + 1]! / n })
    }
  })
  return spans
}

/** Move by `delta` valid names (negative = back). Returns the new name index, or -1 if none valid. */
export function stepIndex(
  m: AlphaModel,
  nameIdx: number,
  delta: number,
): number {
  const total = m.validIdx.length
  if (total === 0) return -1
  const { ord, exact } = ordinalOf(m, nameIdx)
  // An invalid name sits between ord-1 and ord: stepping forward lands on ord, back on ord-1.
  const target = exact ? ord + delta : delta > 0 ? ord + delta - 1 : ord + delta
  return m.validIdx[clamp(target, 0, total - 1)]!
}

/** Jump to the first valid name of the next (dir = 1) or previous (dir = -1) letter that has one. */
export function stepLetter(
  m: AlphaModel,
  nameIdx: number,
  dir: 1 | -1,
): number {
  const k = m.layout.letters.length
  const s = m.layout.bucket[nameIdx]!
  for (let t = s + dir; t >= 0 && t < k; t += dir) {
    if (m.start[t + 1]! > m.start[t]!) return m.validIdx[m.start[t]!]!
  }
  // Already in the first or last letter: go to the end of the list.
  return stepIndex(m, nameIdx, dir * m.validIdx.length)
}

export function firstIndex(m: AlphaModel): number {
  return m.validIdx.length ? m.validIdx[0]! : -1
}

export function lastIndex(m: AlphaModel): number {
  return m.validIdx.length ? m.validIdx[m.validIdx.length - 1]! : -1
}

/**
 * Fine movement: `deltaNames` valid names away from the start name
 * (e.g. one name per pixel the pointer moved).
 */
export function dragIndex(
  m: AlphaModel,
  startIdx: number,
  deltaNames: number,
): number {
  const total = m.validIdx.length
  if (total === 0) return -1
  const target = Math.round(ordinalOfFractional(m, startIdx) + deltaNames)
  return m.validIdx[clamp(target, 0, total - 1)]!
}
