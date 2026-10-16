import { useMemo } from 'react'
import { buildAlphaModel, computeAlphaLayout } from '../engine/alphaModel.ts'
import { personLabels } from '../engine/people.ts'
import type { AlphaKind } from '../store/queryState.ts'
import { useApp } from '../store/useApp.ts'
import { Alphaslider } from './Alphaslider.tsx'

const WIDGETS: { kind: AlphaKind; label: string }[] = [
  { kind: 'title', label: 'Title' },
  { kind: 'actor', label: 'Actor' },
  { kind: 'actress', label: 'Actress' },
  { kind: 'director', label: 'Director' },
]

function AlphaWidget({ kind, label }: { kind: AlphaKind; label: string }) {
  const engine = useApp((s) => s.engine)!
  const index = useApp((s) => s.indexes[kind])
  const value = useApp((s) => s.query.alpha[kind])
  const setAlpha = useApp((s) => s.setAlpha)
  const version = useApp((s) => s.version)
  const peopleStatus = useApp((s) => s.peopleStatus)
  const filmTitles = useApp((s) => s.films!.title)
  const loadPeople = useApp((s) => s.loadPeople)

  // Namesakes get their best-known film appended so they can be told apart.
  const labels = useMemo(
    () => (index ? personLabels(index, filmTitles) : null),
    [index, filmTitles],
  )

  // The letter layout depends only on the list; valid names change with every query.
  const layout = useMemo(
    () => (index ? computeAlphaLayout(index.names) : null),
    [index],
  )
  const model = useMemo(() => {
    void version
    if (!index || !layout) return null
    return buildAlphaModel(layout, engine.validNames(kind, index.films))
  }, [engine, index, layout, kind, version])

  if (!index || !model) {
    return (
      <div className="widget">
        <div className="widget-head">
          <span>{label}</span>
          {peopleStatus === 'error' ? (
            <span className="widget-value">
              could not load names{' '}
              <button
                type="button"
                className="link"
                onClick={() => void loadPeople()}
              >
                Retry
              </button>
            </span>
          ) : (
            <span className="widget-value">loading…</span>
          )}
        </div>
      </div>
    )
  }
  return (
    <Alphaslider
      label={label}
      names={labels!}
      model={model}
      value={value}
      onChange={(name) => setAlpha(kind, name)}
    />
  )
}

export function AlphaSliders() {
  return (
    <>
      {WIDGETS.map((w) => (
        <AlphaWidget key={w.kind} {...w} />
      ))}
    </>
  )
}
