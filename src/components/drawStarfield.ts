import { scaleLinear, scaleLog, type ScaleContinuousNumeric } from 'd3-scale'
import type { ZoomTransform } from 'd3-zoom'
import { DrawList, STAR_H, STAR_W, type Bounds } from '../engine/drawList.ts'
import type { QueryEngine } from '../engine/engine.ts'
import type { StarLayout, YAxis } from '../engine/layout.ts'
import type { SpatialGrid } from '../engine/spatialGrid.ts'
import { GENRE_COLORS } from '../genres.ts'

export const MARGIN = { left: 56, right: 12, top: 12, bottom: 32 }

const AXIS_COLOR = '#9aa3b2'
const GRID_COLOR = 'rgba(154, 163, 178, 0.12)'

export interface DrawParams {
  canvas: HTMLCanvasElement
  width: number
  height: number
  transform: ZoomTransform
  yAxis: YAxis
  yearDomain: [number, number]
  /** Data range of the popularity axis (only used when yAxis is 'votes'). */
  popularityDomain: [number, number]
  /** Axis title for the popularity axis, e.g. "votes" or "Wikipedia editions". */
  popularityLabel: string
  engine: QueryEngine
  layout: StarLayout
  drawList: DrawList
  grid: SpatialGrid
  hovered: number
  selected: number
  /** Called each frame with the selected star's screen position, or null if it is not visible. */
  onSelectedPos?: (pos: { x: number; y: number } | null) => void
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Ticks at 1, 2 and 5 times a power of ten inside the domain; every digit if that gives too few. */
export function logTicks([lo, hi]: [number, number]): number[] {
  const within = (digits: number[]) => {
    const ticks: number[] = []
    for (
      let k = Math.floor(Math.log10(lo));
      k <= Math.ceil(Math.log10(hi));
      k++
    ) {
      for (const m of digits) {
        const v = m * 10 ** k
        if (v >= lo && v <= hi) ticks.push(v)
      }
    }
    return ticks
  }
  const coarse = within([1, 2, 5])
  return coarse.length >= 3 ? coarse : within([1, 2, 3, 4, 5, 6, 7, 8, 9])
}

function formatVotes(v: number): string {
  if (v >= 1e6) return `${v / 1e6}M`
  if (v >= 1e3) return `${v / 1e3}k`
  return String(v)
}

/** Draw axes and stars, and rebuild the hit-test grid for this frame. */
export function drawStarfield(p: DrawParams): void {
  const { width: w, height: h, engine, layout } = p
  const ctx = p.canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const bounds: Bounds = {
    left: MARGIN.left,
    top: MARGIN.top,
    right: w - MARGIN.right,
    bottom: h - MARGIN.bottom,
  }
  const baseX: ScaleContinuousNumeric<number, number> = scaleLinear()
    .domain(p.yearDomain)
    .range([bounds.left, bounds.right])
  const baseY: ScaleContinuousNumeric<number, number> =
    p.yAxis === 'rating'
      ? scaleLinear().domain([0.8, 10.2]).range([bounds.bottom, bounds.top])
      : scaleLog()
          .domain([p.popularityDomain[0] / 1.2, p.popularityDomain[1] * 1.2])
          .range([bounds.bottom, bounds.top])
  const sx = p.transform.rescaleX(baseX)
  const sy = p.transform.rescaleY(baseY)

  // Axes and gridlines
  ctx.font = '11px system-ui, sans-serif'
  ctx.fillStyle = AXIS_COLOR
  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const tick of sx.ticks(
    Math.max(2, Math.floor((bounds.right - bounds.left) / 70)),
  )) {
    const x = Math.round(sx(tick)) + 0.5
    if (x < bounds.left || x > bounds.right) continue
    ctx.beginPath()
    ctx.moveTo(x, bounds.top)
    ctx.lineTo(x, bounds.bottom)
    ctx.stroke()
    ctx.fillText(String(tick), x, bounds.bottom + 6)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const yTicks =
    p.yAxis === 'rating'
      ? sy.ticks(Math.max(2, Math.floor((bounds.bottom - bounds.top) / 40)))
      : logTicks(sy.domain() as [number, number])
  for (const tick of yTicks) {
    const y = Math.round(sy(tick)) + 0.5
    if (y < bounds.top || y > bounds.bottom) continue
    ctx.beginPath()
    ctx.moveTo(bounds.left, y)
    ctx.lineTo(bounds.right, y)
    ctx.stroke()
    ctx.fillText(
      p.yAxis === 'rating' ? String(tick) : formatVotes(tick),
      bounds.left - 8,
      y,
    )
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('Year', (bounds.left + bounds.right) / 2, h - 2)
  ctx.save()
  ctx.translate(12, (bounds.top + bounds.bottom) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textBaseline = 'top'
  ctx.fillText(
    p.yAxis === 'rating' ? 'Rating' : `${capitalize(p.popularityLabel)} (log)`,
    0,
    -10,
  )
  ctx.restore()

  // Stars: only films in the result mask, one per star-sized cell.
  const list = p.drawList
  list.build(engine.resultMask, layout.xs, layout.ys, sx, sy, bounds)
  p.grid.build(w, h, list.n, list.idx, list.px, list.py)

  ctx.save()
  ctx.beginPath()
  ctx.rect(
    bounds.left,
    bounds.top,
    bounds.right - bounds.left,
    bounds.bottom - bounds.top,
  )
  ctx.clip()
  const primary = engine.store.primaryGenre
  for (let g = 0; g < GENRE_COLORS.length; g++) {
    ctx.fillStyle = GENRE_COLORS[g]!
    for (let k = 0; k < list.n; k++) {
      if (primary[list.idx[k]!] === g) {
        ctx.fillRect(
          list.px[k]! - STAR_W / 2,
          list.py[k]! - STAR_H / 2,
          STAR_W,
          STAR_H,
        )
      }
    }
  }
  for (const [film, color] of [
    [p.hovered, '#ffffff'],
    [p.selected, '#ff4d6d'],
  ] as const) {
    if (film < 0 || engine.resultMask[film] === 0) continue
    const x = sx(layout.xs[film]!)
    const y = sy(layout.ys[film]!)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.strokeRect(
      x - STAR_W / 2 - 2,
      y - STAR_H / 2 - 2,
      STAR_W + 4,
      STAR_H + 4,
    )
  }
  ctx.restore()

  if (p.onSelectedPos) {
    let pos: { x: number; y: number } | null = null
    if (p.selected >= 0 && engine.resultMask[p.selected] !== 0) {
      const x = sx(layout.xs[p.selected]!)
      const y = sy(layout.ys[p.selected]!)
      if (
        x >= bounds.left &&
        x <= bounds.right &&
        y >= bounds.top &&
        y <= bounds.bottom
      ) {
        pos = { x, y }
      }
    }
    p.onSelectedPos(pos)
  }
}
