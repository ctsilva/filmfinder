import {
  LENGTH_HI,
  LENGTH_LO,
  YEAR_HI,
  YEAR_LO,
  ALL_CERTS,
  CERT_LABELS,
} from '../store/queryState.ts'
import { useApp } from '../store/useApp.ts'
import { AlphaSliders } from './AlphaSliders.tsx'
import { RangeSlider } from './RangeSlider.tsx'

export function QueryPanel() {
  const engine = useApp((s) => s.engine)!
  const query = useApp((s) => s.query)
  const setQuery = useApp((s) => s.setQuery)
  useApp((s) => s.version) // recompute valid values whenever the result changes

  const { store } = engine
  const presentYears = engine.presentValues('year', store.year)
  const presentLengths = engine.presentValues('length', store.length)
  const validCerts = engine.validBits('cert', store.certBit)

  return (
    <>
      <AlphaSliders />
      <RangeSlider
        label="Year"
        lo={YEAR_LO}
        hi={YEAR_HI}
        value={query.year ?? [YEAR_LO, YEAR_HI]}
        present={presentYears}
        onChange={(year) => setQuery({ year })}
      />
      <RangeSlider
        label="Length"
        lo={LENGTH_LO}
        hi={LENGTH_HI}
        unit=" min"
        value={query.length ?? [LENGTH_LO, LENGTH_HI]}
        present={presentLengths}
        onChange={(length) => setQuery({ length })}
      />
      <fieldset className="widget">
        <legend>Rating</legend>
        <div className="certs">
          {CERT_LABELS.map((name, code) => (
            <label
              key={name}
              className={validCerts & (1 << code) ? '' : 'unavailable'}
            >
              <input
                type="checkbox"
                checked={(query.certs & (1 << code)) !== 0}
                disabled={(validCerts & (1 << code)) === 0}
                onChange={() => setQuery({ certs: query.certs ^ (1 << code) })}
              />{' '}
              {name}
            </label>
          ))}
        </div>
        {query.certs !== ALL_CERTS && (
          <button
            type="button"
            className="link"
            onClick={() => setQuery({ certs: ALL_CERTS })}
          >
            All ratings
          </button>
        )}
      </fieldset>
    </>
  )
}
