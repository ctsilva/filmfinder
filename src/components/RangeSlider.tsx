import { useId, useMemo } from 'react'
import { allowedPositions, snapMax, snapMin } from '../engine/rangeSnap.ts'

interface Props {
  label: string
  /** Fixed span of the slider. */
  lo: number
  hi: number
  value: [number, number]
  /** Values that occur among the films the other widgets leave (tight coupling). */
  present: readonly number[]
  onChange: (value: [number, number]) => void
  unit?: string
}

function describe(v: number, lo: number, hi: number, unit: string): string {
  if (v <= lo) return `≤${lo}${unit}`
  if (v >= hi) return `${hi}+${unit}`
  return `${v}${unit}`
}

/**
 * Two-thumb range slider. A thumb can only rest on a value that has films under the
 * other widgets' filters, so the range can never be empty. The lighter band on the
 * track shows the span that has films.
 */
export function RangeSlider({
  label,
  lo,
  hi,
  value,
  present,
  onChange,
  unit = '',
}: Props) {
  const id = useId()
  const [a, b] = value
  const allowed = useMemo(
    () => allowedPositions(present, lo, hi),
    [present, lo, hi],
  )
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100
  const first = allowed[0]
  const last = allowed[allowed.length - 1]

  return (
    <div className="widget">
      <div className="widget-head">
        <label htmlFor={`${id}-min`}>{label}</label>
        <span className="widget-value">
          {describe(a, lo, hi, unit)} – {describe(b, lo, hi, unit)}
        </span>
      </div>
      <div className="range">
        <div className="range-track" />
        {first !== undefined && last !== undefined && (
          <div
            className="range-valid"
            style={{
              left: `${pct(first)}%`,
              width: `${pct(last) - pct(first)}%`,
            }}
          />
        )}
        <div
          className="range-selected"
          style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }}
        />
        <input
          id={`${id}-min`}
          type="range"
          min={lo}
          max={hi}
          value={a}
          aria-label={`${label} minimum`}
          onChange={(e) =>
            onChange(snapMin(allowed, Number(e.target.value), [a, b]))
          }
        />
        <input
          type="range"
          min={lo}
          max={hi}
          value={b}
          aria-label={`${label} maximum`}
          onChange={(e) =>
            onChange(snapMax(allowed, Number(e.target.value), [a, b]))
          }
        />
      </div>
    </div>
  )
}
