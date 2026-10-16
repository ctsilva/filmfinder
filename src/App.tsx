import { useEffect } from 'react'
import { GenreLegend } from './components/GenreLegend.tsx'
import { QueryPanel } from './components/QueryPanel.tsx'
import { ResultsList } from './components/ResultsList.tsx'
import { Starfield } from './components/Starfield.tsx'
import { useApp } from './store/useApp.ts'

export default function App() {
  const status = useApp((s) => s.status)
  const error = useApp((s) => s.error)
  const load = useApp((s) => s.load)
  const yAxis = useApp((s) => s.yAxis)
  const setYAxis = useApp((s) => s.setYAxis)
  const engine = useApp((s) => s.engine)
  const meta = useApp((s) => s.meta)
  const notice = useApp((s) => s.notice)
  const version = useApp((s) => s.version)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div id="app">
      <main className="main">
        {status === 'ready' ? (
          <>
            <div className="plot">
              <Starfield />
            </div>
            <GenreLegend />
          </>
        ) : status === 'error' ? (
          <p className="message">
            Could not load data: {error}. Run `npm run build-wikidata` for the
            small sample, or see the README to build the full data.
          </p>
        ) : (
          <p className="message">Loading films…</p>
        )}
      </main>
      <aside className="panel">
        <h1>FilmFinder</h1>
        {engine && (
          <p className="count" data-version={version}>
            {engine.count.toLocaleString()} of{' '}
            {engine.store.count.toLocaleString()} films
          </p>
        )}
        {status === 'ready' && <QueryPanel />}
        {meta?.hasRating && (
          <fieldset>
            <legend>Y axis</legend>
            <label>
              <input
                type="radio"
                name="yaxis"
                checked={yAxis === 'rating'}
                onChange={() => setYAxis('rating')}
              />{' '}
              Rating
            </label>
            <label>
              <input
                type="radio"
                name="yaxis"
                checked={yAxis === 'votes'}
                onChange={() => setYAxis('votes')}
              />{' '}
              Votes (log)
            </label>
          </fieldset>
        )}
        {status === 'ready' && <ResultsList />}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {meta && (
          <footer className="footer">
            <p>
              <strong>Data: {meta.sourceLabel}</strong>
            </p>
            <p>{meta.attribution}</p>
          </footer>
        )}
      </aside>
    </div>
  )
}
