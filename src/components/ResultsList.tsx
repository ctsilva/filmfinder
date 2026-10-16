import { useEffect, useMemo, useRef } from 'react'
import { firstResults } from '../engine/results.ts'
import { useApp } from '../store/useApp.ts'

const LIMIT = 50

/**
 * The films matching the current query, most popular first, as a keyboard-operable list.
 * Choosing one opens its detail card (the same one a click on the starfield opens), and
 * closing the card puts focus back on the list item. It also helps with dense clusters
 * of stars, where a pointer cannot pick out a single film.
 */
export function ResultsList() {
  const engine = useApp((s) => s.engine)!
  const films = useApp((s) => s.films)!
  const version = useApp((s) => s.version)
  const selected = useApp((s) => s.selected)
  const selectedVia = useApp((s) => s.selectedVia)
  const setSelected = useApp((s) => s.setSelected)
  const setHovered = useApp((s) => s.setHovered)

  const shown = useMemo(() => {
    void version
    return firstResults(engine.resultMask, LIMIT)
  }, [engine, version])

  // When a card that was opened from this list closes, return focus to its list item.
  const previous = useRef({ film: -1, via: 'pointer' as 'pointer' | 'list' })
  useEffect(() => {
    const prev = previous.current
    if (selected === -1 && prev.film !== -1 && prev.via === 'list') {
      document.getElementById(`film-${prev.film}`)?.focus()
    }
    previous.current = { film: selected, via: selectedVia }
  }, [selected, selectedVia])

  return (
    <section className="results" aria-label="Matching films">
      <h2>Films</h2>
      {shown.length === 0 ? (
        <p className="muted">No film matches.</p>
      ) : (
        <>
          <ul>
            {shown.map((film) => (
              <li key={film}>
                <button
                  type="button"
                  id={`film-${film}`}
                  className="result"
                  aria-current={selected === film ? 'true' : undefined}
                  onClick={() => setSelected(film, 'list')}
                  onMouseEnter={() => setHovered(film)}
                  onMouseLeave={() => setHovered(-1)}
                  onFocus={() => setHovered(film)}
                  onBlur={() => setHovered(-1)}
                >
                  {films.title[film]}{' '}
                  <span className="muted">({films.year[film]})</span>
                </button>
              </li>
            ))}
          </ul>
          {engine.count > shown.length && (
            <p className="muted">
              The {shown.length} best-known of {engine.count.toLocaleString()}.
              Narrow the query to see others.
            </p>
          )}
        </>
      )}
    </section>
  )
}
