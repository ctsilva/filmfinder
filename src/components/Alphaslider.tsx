import { useEffect, useId, useRef, useState } from 'react'
import {
  dragIndex,
  firstIndex,
  indexToPosition,
  lastIndex,
  letterSpans,
  ordinalOf,
  positionToIndex,
  stepIndex,
  stepLetter,
  type AlphaModel,
} from '../engine/alphaModel.ts'

/** Smallest letter width (px) that still gets a label in the index. */
const MIN_LABEL_PX = 9
/** Fine movement: names advanced per pixel the pointer moves. */
const FINE_NAMES_PER_PX = 1
/** Arrow button auto-repeat. */
const REPEAT_DELAY_MS = 350
const REPEAT_INTERVAL_MS = 50

type Zone = 'coarse' | 'fine'

interface Props {
  label: string
  names: readonly string[]
  model: AlphaModel
  /** Selected name index, or null for ALL. */
  value: number | null
  onChange: (value: number | null) => void
}

/**
 * Alphaslider (Ahlberg & Shneiderman, CHI '94, redesigned version, Figure 8).
 *
 * - The text output above shows the selected name and updates as you move.
 * - Click anywhere on the slide area to jump there.
 * - Drag the thumb. The upper half moves coarsely (the thumb follows the pointer
 *   across the whole list); the lower half moves finely (one name per pixel).
 * - The arrow buttons step one name, and repeat while held.
 * - The index under the slide area is spaced by how many names start with each letter.
 * - Only names that still have films can be reached.
 */
export function Alphaslider({ label, names, model, value, onChange }: Props) {
  const id = useId()
  const areaRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    zone: Zone
    x0: number
    p0: number
    idx0: number
  } | null>(null)
  const [zone, setZone] = useState<Zone | null>(null)
  const [areaWidth, setAreaWidth] = useState(0)

  const total = model.validIdx.length
  const thumbPos = value === null ? null : indexToPosition(model, value)
  const ordinal = value === null ? 0 : ordinalOf(model, value).ord + 1

  // Latest props for the repeat timer, which outlives a render.
  const latest = useRef({ model, value, onChange })
  useEffect(() => {
    latest.current = { model, value, onChange }
  })

  useEffect(() => {
    const area = areaRef.current!
    const observer = new ResizeObserver(() => setAreaWidth(area.clientWidth))
    observer.observe(area)
    return () => observer.disconnect()
  }, [])

  // ---- Arrow buttons with hold-to-repeat -------------------------------------------------
  const repeat = useRef<{ delay?: number; interval?: number }>({})
  const stopRepeat = () => {
    window.clearTimeout(repeat.current.delay)
    window.clearInterval(repeat.current.interval)
    repeat.current = {}
  }
  useEffect(() => stopRepeat, [])

  const stepBy = (dir: 1 | -1) => {
    const { model: m, value: v, onChange: change } = latest.current
    const next =
      v === null
        ? dir > 0
          ? firstIndex(m)
          : lastIndex(m)
        : stepIndex(m, v, dir)
    if (next >= 0) change(next)
  }
  const startRepeat = (dir: 1 | -1) => {
    stopRepeat()
    stepBy(dir)
    repeat.current.delay = window.setTimeout(() => {
      repeat.current.interval = window.setInterval(
        () => stepBy(dir),
        REPEAT_INTERVAL_MS,
      )
    }, REPEAT_DELAY_MS)
  }

  // ---- Pointer interaction on the slide area -------------------------------------------
  const pointerP = (e: React.PointerEvent) => {
    const rect = areaRef.current!.getBoundingClientRect()
    return (e.clientX - rect.left) / rect.width
  }

  const commit = (idx: number) => {
    if (idx >= 0) onChange(idx)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (total === 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    areaRef.current!.focus()
    const onThumb = (e.target as HTMLElement).closest(
      '[data-zone]',
    ) as HTMLElement | null
    if (onThumb && value !== null) {
      // Grab the thumb: the part you grab sets the granularity.
      const grabbed = onThumb.dataset.zone as Zone
      drag.current = {
        zone: grabbed,
        x0: e.clientX,
        p0: thumbPos ?? 0,
        idx0: value,
      }
      setZone(grabbed)
    } else {
      // Click on the slide area: jump straight there, then keep dragging coarsely.
      const p = pointerP(e)
      const idx = positionToIndex(model, p)
      drag.current = {
        zone: 'coarse',
        x0: e.clientX,
        p0: indexToPosition(model, idx),
        idx0: idx,
      }
      setZone('coarse')
      commit(idx)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dx = e.clientX - d.x0
    if (d.zone === 'coarse') {
      commit(positionToIndex(model, d.p0 + dx / areaRef.current!.clientWidth))
    } else {
      commit(dragIndex(model, d.idx0, dx * FINE_NAMES_PER_PX))
    }
  }

  const endDrag = () => {
    drag.current = null
    setZone(null)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next: number | null | undefined
    const from = value
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = from === null ? firstIndex(model) : stepIndex(model, from, 1)
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        next = from === null ? lastIndex(model) : stepIndex(model, from, -1)
        break
      case 'PageUp':
        next = from === null ? firstIndex(model) : stepLetter(model, from, 1)
        break
      case 'PageDown':
        next = from === null ? lastIndex(model) : stepLetter(model, from, -1)
        break
      case 'Home':
        next = firstIndex(model)
        break
      case 'End':
        next = lastIndex(model)
        break
      case 'Escape':
      case 'Delete':
      case 'Backspace':
        next = null
        break
      default:
        return
    }
    e.preventDefault()
    if (next === null) onChange(null)
    else if (next !== undefined) commit(next)
  }

  const shown = value === null ? 'ALL' : names[value]
  const spans = letterSpans(model)

  return (
    <div className="widget alpha">
      <div className="widget-head">
        <span id={`${id}-label`}>{label}</span>
        <span className="alpha-value" title={shown}>
          {shown}
        </span>
        <button
          type="button"
          className="alpha-clear"
          aria-label={`Clear ${label}`}
          disabled={value === null}
          onClick={() => onChange(null)}
        >
          ×
        </button>
      </div>
      <div className="alpha-row">
        <button
          type="button"
          className="alpha-arrow"
          aria-label={`${label}: previous name`}
          tabIndex={-1}
          disabled={total === 0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            startRepeat(-1)
          }}
          onPointerUp={stopRepeat}
          onPointerCancel={stopRepeat}
        >
          ◀
        </button>
        <div className="alpha-body">
          <div
            ref={areaRef}
            className={`alpha-area${zone ? ` dragging ${zone}` : ''}`}
            role="slider"
            tabIndex={0}
            aria-labelledby={`${id}-label`}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={ordinal}
            aria-valuetext={shown}
            aria-disabled={total === 0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
          >
            {thumbPos !== null && (
              <div
                className="alpha-thumb"
                style={{ left: `${thumbPos * 100}%` }}
              >
                <div className="thumb-zone coarse" data-zone="coarse" />
                <div className="thumb-zone fine" data-zone="fine" />
              </div>
            )}
          </div>
          <div className="alpha-index" aria-hidden="true">
            {spans.map(
              (s) =>
                (s.to - s.from) * areaWidth >= MIN_LABEL_PX && (
                  <span
                    key={s.letter}
                    style={{ left: `${((s.from + s.to) / 2) * 100}%` }}
                  >
                    {s.letter}
                  </span>
                ),
            )}
          </div>
        </div>
        <button
          type="button"
          className="alpha-arrow"
          aria-label={`${label}: next name`}
          tabIndex={-1}
          disabled={total === 0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            startRepeat(1)
          }}
          onPointerUp={stopRepeat}
          onPointerCancel={stopRepeat}
        >
          ▶
        </button>
      </div>
      <div className="alpha-hint">
        {zone === 'coarse' && 'coarse: thumb follows the pointer'}
        {zone === 'fine' && 'fine: one name per pixel'}
        {zone === null &&
          value !== null &&
          total > 0 &&
          `${ordinal.toLocaleString()} of ${total.toLocaleString()}`}
      </div>
    </div>
  )
}
