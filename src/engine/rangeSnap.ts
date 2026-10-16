/**
 * Range sliders that cannot produce an empty query.
 *
 * Given the values that actually occur among the films the other filters leave
 * (`present`), a thumb may only rest on one of those values. A range whose two
 * thumbs are on occurring values, lower thumb at or below the upper one, always
 * contains at least the film at the lower thumb's value, so it is never empty.
 *
 * Slider ends are "end stops": a thumb at `lo` means no lower limit and a thumb at
 * `hi` means no upper limit, so values beyond the ends are folded onto the ends.
 */

/** Sorted distinct slider positions that have at least one film. */
export function allowedPositions(
  present: readonly number[],
  lo: number,
  hi: number,
): number[] {
  const set = new Set<number>()
  for (const v of present) set.add(Math.min(hi, Math.max(lo, v)))
  return [...set].sort((a, b) => a - b)
}

function nearest(candidates: readonly number[], target: number): number {
  let best = candidates[0]!
  for (const c of candidates) {
    // ties go to the lower value
    if (Math.abs(c - target) < Math.abs(best - target)) best = c
  }
  return best
}

/**
 * Move the lower thumb towards `value`. It lands on the nearest allowed position
 * that is not above the upper thumb. Returns the new [min, max].
 */
export function snapMin(
  allowed: readonly number[],
  value: number,
  [, max]: [number, number],
): [number, number] {
  if (allowed.length === 0) return [Math.min(value, max), max]
  const candidates = allowed.filter((p) => p <= max)
  if (candidates.length === 0) {
    // the upper thumb is below everything that exists (stale after another filter changed)
    const m = nearest(allowed, value)
    return [m, m]
  }
  return [nearest(candidates, value), max]
}

/** Move the upper thumb towards `value`; the mirror image of snapMin. */
export function snapMax(
  allowed: readonly number[],
  value: number,
  [min]: [number, number],
): [number, number] {
  if (allowed.length === 0) return [min, Math.max(value, min)]
  const candidates = allowed.filter((p) => p >= min)
  if (candidates.length === 0) {
    const m = nearest(allowed, value)
    return [m, m]
  }
  return [min, nearest(candidates, value)]
}

/** Does any present value fall inside the range, with the end stops meaning no limit? */
export function rangeHasFilm(
  present: readonly number[],
  lo: number,
  hi: number,
  [min, max]: [number, number],
): boolean {
  const from = min <= lo ? -Infinity : min
  const to = max >= hi ? Infinity : max
  return present.some((v) => v >= from && v <= to)
}
