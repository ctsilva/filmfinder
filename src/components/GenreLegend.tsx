import { GENRE_COLORS, OTHER_GENRE_NAME } from '../genres.ts'
import { ALL_GENRES } from '../store/queryState.ts'
import { useApp } from '../store/useApp.ts'

/** Color legend that doubles as genre toggle buttons. */
export function GenreLegend() {
  const engine = useApp((s) => s.engine)!
  const meta = useApp((s) => s.meta)!
  const genres = useApp((s) => s.query.genres)
  const setQuery = useApp((s) => s.setQuery)
  useApp((s) => s.version)

  const names = [...meta.legendGenres, OTHER_GENRE_NAME]
  const valid = engine.validBits('genre', engine.store.primaryBit)

  return (
    <div className="legend" role="group" aria-label="Genres">
      {names.map((name, bit) => {
        const on = (genres & (1 << bit)) !== 0
        const available = (valid & (1 << bit)) !== 0
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            className={`chip${on ? '' : ' off'}${available ? '' : ' unavailable'}`}
            onClick={() => setQuery({ genres: genres ^ (1 << bit) })}
          >
            <span
              className="swatch"
              style={{ background: GENRE_COLORS[bit] }}
            />
            {name}
          </button>
        )
      })}
      {genres !== ALL_GENRES && (
        <button
          type="button"
          className="link"
          onClick={() => setQuery({ genres: ALL_GENRES })}
        >
          All genres
        </button>
      )}
    </div>
  )
}
