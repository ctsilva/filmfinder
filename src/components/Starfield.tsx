import { select } from 'd3-selection'
import {
  zoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3-zoom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DrawList } from '../engine/drawList.ts'
import { computeLayout } from '../engine/layout.ts'
import { SpatialGrid } from '../engine/spatialGrid.ts'
import { useApp } from '../store/useApp.ts'
import { DetailCard } from './DetailCard.tsx'
import { drawStarfield, MARGIN, type DrawParams } from './drawStarfield.ts'

const HOVER_RADIUS = 8
/** Where the card goes for a film chosen from the list when its star is not in view. */
const LIST_ANCHOR = { x: 24, y: 24 }

type Latest = Omit<
  DrawParams,
  'canvas' | 'width' | 'height' | 'transform' | 'onSelectedPos'
>

export function Starfield() {
  const engine = useApp((s) => s.engine)!
  const films = useApp((s) => s.films)!
  const version = useApp((s) => s.version)
  const yAxis = useApp((s) => s.yAxis)
  const hovered = useApp((s) => s.hovered)
  const selected = useApp((s) => s.selected)
  const selectedVia = useApp((s) => s.selectedVia)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const sizeRef = useRef({ w: 0, h: 0 })
  const rafRef = useRef(0)
  const latestRef = useRef<Latest | null>(null)
  const drawList = useMemo(() => new DrawList(engine.store.count), [engine])
  const grid = useMemo(() => new SpatialGrid(12), [])
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const layout = useMemo(
    () => computeLayout(engine.store, yAxis),
    [engine, yAxis],
  )

  const yearDomain = useMemo<[number, number]>(() => {
    const { year, count } = engine.store
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < count; i++) {
      if (year[i]! < min) min = year[i]!
      if (year[i]! > max) max = year[i]!
    }
    return [min - 1, max + 2]
  }, [engine])

  // Range of the popularity values (votes, Wikipedia editions...) for the log axis.
  const popularityDomain = useMemo<[number, number]>(() => {
    const { votes, count } = engine.store
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < count; i++) {
      if (votes[i]! > 0 && votes[i]! < min) min = votes[i]!
      if (votes[i]! > max) max = votes[i]!
    }
    return min === Infinity ? [1, 10] : [min, max]
  }, [engine])
  const popularityLabel = useApp((s) => s.meta?.popularityLabel ?? 'votes')

  const requestDraw = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const canvas = canvasRef.current
      const latest = latestRef.current
      const { w, h } = sizeRef.current
      if (!canvas || !latest || w === 0) return
      drawStarfield({
        ...latest,
        canvas,
        width: w,
        height: h,
        transform: transformRef.current,
        // The detail card follows the selected star as you zoom and pan.
        onSelectedPos: (pos) =>
          setAnchor((prev) =>
            pos === null
              ? prev === null
                ? prev
                : null
              : prev &&
                  Math.abs(prev.x - pos.x) < 0.5 &&
                  Math.abs(prev.y - pos.y) < 0.5
                ? prev
                : pos,
          ),
      })
    })
  }, [])

  // Hand the latest state to the draw loop, then redraw.
  useEffect(() => {
    latestRef.current = {
      yAxis,
      yearDomain,
      popularityDomain,
      popularityLabel,
      engine,
      layout,
      drawList,
      grid,
      hovered,
      selected,
    }
    requestDraw()
  }, [
    version,
    yAxis,
    yearDomain,
    popularityDomain,
    popularityLabel,
    engine,
    layout,
    drawList,
    grid,
    hovered,
    selected,
    requestDraw,
  ])

  // Zoom and pan
  useEffect(() => {
    const canvas = canvasRef.current!
    const z = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 80])
      .on('zoom', (event) => {
        transformRef.current = event.transform
        requestDraw()
      })
    zoomRef.current = z
    select(canvas).call(z).on('dblclick.zoom', null)
    return () => {
      select(canvas).on('.zoom', null)
    }
  }, [requestDraw])

  // Resize
  useEffect(() => {
    const wrap = wrapRef.current!
    const canvas = canvasRef.current!
    const apply = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const dpr = window.devicePixelRatio || 1
      sizeRef.current = { w, h }
      setSize({ w, h })
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const extent: [[number, number], [number, number]] = [
        [MARGIN.left, MARGIN.top],
        [w - MARGIN.right, h - MARGIN.bottom],
      ]
      zoomRef.current?.extent(extent).translateExtent(extent)
      requestDraw()
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [requestDraw])

  // Reset the view when the Y axis changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas && zoomRef.current)
      select(canvas).call(zoomRef.current.transform, zoomIdentity)
  }, [yAxis])

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 0) {
      useApp.getState().setHovered(-1)
      setTip(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const film = grid.nearest(x, y, HOVER_RADIUS)
    useApp.getState().setHovered(film)
    setTip(film >= 0 ? { x, y } : null)
  }

  const onPointerLeave = () => {
    useApp.getState().setHovered(-1)
    setTip(null)
  }

  const onClick = () => {
    useApp.getState().setSelected(useApp.getState().hovered)
  }

  return (
    <div ref={wrapRef} className="starfield">
      <canvas
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        style={{ cursor: hovered >= 0 ? 'pointer' : 'grab' }}
      />
      {selected >= 0 &&
        size.w > 0 &&
        (anchor ?? (selectedVia === 'list' ? LIST_ANCHOR : null)) && (
          <DetailCard
            film={selected}
            anchor={anchor ?? LIST_ANCHOR}
            container={size}
          />
        )}
      {tip && hovered >= 0 && selected !== hovered && (
        <div className="tooltip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          {films.title[hovered]}{' '}
          <span className="tooltip-year">({films.year[hovered]})</span>
        </div>
      )}
    </div>
  )
}
