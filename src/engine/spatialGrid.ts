/**
 * Uniform grid over screen space for nearest-star lookup.
 * Rebuilt from the draw list each frame; a lookup only inspects the cells near the pointer.
 */
export class SpatialGrid {
  private cols = 0
  private rows = 0
  private heads = new Int32Array(0)
  private next = new Int32Array(0)
  private xs: Float32Array = new Float32Array(0)
  private ys: Float32Array = new Float32Array(0)
  private ids: Int32Array = new Int32Array(0)

  private readonly cell: number

  constructor(cell = 12) {
    this.cell = cell
  }

  /** Index the first n entries of the given parallel arrays. */
  build(
    width: number,
    height: number,
    n: number,
    ids: Int32Array,
    xs: Float32Array,
    ys: Float32Array,
  ): void {
    this.cols = Math.max(1, Math.ceil(width / this.cell))
    this.rows = Math.max(1, Math.ceil(height / this.cell))
    const cells = this.cols * this.rows
    if (this.heads.length < cells) this.heads = new Int32Array(cells)
    this.heads.fill(-1, 0, cells)
    if (this.next.length < n) this.next = new Int32Array(n)
    this.ids = ids
    this.xs = xs
    this.ys = ys
    for (let k = 0; k < n; k++) {
      const c = this.cellOf(xs[k]!, ys[k]!)
      if (c < 0) continue
      this.next[k] = this.heads[c]!
      this.heads[c] = k
    }
  }

  /** Film id of the star closest to (x, y) within `radius` pixels, or -1. */
  nearest(x: number, y: number, radius: number): number {
    const cx = Math.floor(x / this.cell)
    const cy = Math.floor(y / this.cell)
    const reach = Math.ceil(radius / this.cell)
    let best = -1
    let bestD = radius * radius
    for (
      let gy = Math.max(0, cy - reach);
      gy <= Math.min(this.rows - 1, cy + reach);
      gy++
    ) {
      for (
        let gx = Math.max(0, cx - reach);
        gx <= Math.min(this.cols - 1, cx + reach);
        gx++
      ) {
        for (
          let k = this.heads[gy * this.cols + gx]!;
          k !== -1;
          k = this.next[k]!
        ) {
          const dx = this.xs[k]! - x
          const dy = this.ys[k]! - y
          const d = dx * dx + dy * dy
          if (d <= bestD) {
            bestD = d
            best = this.ids[k]!
          }
        }
      }
    }
    return best
  }

  private cellOf(x: number, y: number): number {
    const gx = Math.floor(x / this.cell)
    const gy = Math.floor(y / this.cell)
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return -1
    return gy * this.cols + gx
  }
}
