/** Size of one star in CSS pixels (the paper uses small rectangles of about 6x3). */
export const STAR_W = 6
export const STAR_H = 3

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Screen positions of the films to draw this frame.
 *
 * Overplotting reduction: the plot is divided into cells the size of one star.
 * Only the first film (in index order) to land in a cell is kept. Films are
 * stored most-voted first, so the most popular film wins each cell, and zooming
 * in spreads films over more cells and reveals the rest.
 */
export class DrawList {
  idx: Int32Array
  px: Float32Array
  py: Float32Array
  n = 0

  private stamp = new Int32Array(0)
  private frame = 0

  constructor(capacity: number) {
    this.idx = new Int32Array(capacity)
    this.px = new Float32Array(capacity)
    this.py = new Float32Array(capacity)
  }

  /**
   * @param mask    1 if the film passes the query
   * @param xs, ys  data-space coordinates per film
   * @param sx, sy  data -> screen pixel mapping (already includes zoom)
   * @param bounds  plot area in screen pixels; films outside are skipped
   * @param dedupe  false disables overplotting reduction (every visible film is kept)
   */
  build(
    mask: Uint8Array,
    xs: ArrayLike<number>,
    ys: ArrayLike<number>,
    sx: (v: number) => number,
    sy: (v: number) => number,
    bounds: Bounds,
    dedupe = true,
  ): number {
    const cols = Math.ceil((bounds.right - bounds.left) / STAR_W) + 1
    const rows = Math.ceil((bounds.bottom - bounds.top) / STAR_H) + 1
    if (this.stamp.length < cols * rows)
      this.stamp = new Int32Array(cols * rows)
    const frame = ++this.frame
    const { stamp, idx, px, py } = this

    let n = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) continue
      const x = sx(xs[i]!)
      const y = sy(ys[i]!)
      if (
        x < bounds.left ||
        x > bounds.right ||
        y < bounds.top ||
        y > bounds.bottom
      )
        continue
      if (dedupe) {
        const cell =
          Math.floor((y - bounds.top) / STAR_H) * cols +
          Math.floor((x - bounds.left) / STAR_W)
        if (stamp[cell] === frame) continue
        stamp[cell] = frame
      }
      idx[n] = i
      px[n] = x
      py[n] = y
      n++
    }
    this.n = n
    return n
  }
}
