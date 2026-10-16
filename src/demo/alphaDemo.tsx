import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Alphaslider } from '../components/Alphaslider.tsx'
import { buildAlphaModel, computeAlphaLayout } from '../engine/alphaModel.ts'
import { collationKey } from '../engine/collation.ts'
import { makeRng } from '../engine/synthetic.ts'
import '../index.css'

/** Isolated alphaslider with 20,000 made-up names and an adjustable share of "valid" ones. */
function makeNames(n: number): string[] {
  const rng = makeRng(42)
  const syllables = [
    'an',
    'be',
    'ca',
    'do',
    'el',
    'fi',
    'ga',
    'ho',
    'il',
    'jo',
    'ka',
    'lo',
    'mi',
    'no',
    'ra',
    'sa',
    'to',
    'vu',
  ]
  const names = new Set<string>()
  while (names.size < n) {
    let name = ''
    for (let s = 2 + Math.floor(rng() * 3); s > 0; s--) {
      name += syllables[Math.floor(rng() * syllables.length)]
    }
    names.add(name[0]!.toUpperCase() + name.slice(1))
  }
  return [...names].sort((a, b) => (collationKey(a) < collationKey(b) ? -1 : 1))
}

function Demo() {
  const names = useMemo(() => makeNames(20_000), [])
  const layout = useMemo(() => computeAlphaLayout(names), [names])
  const [percent, setPercent] = useState(100)
  const [value, setValue] = useState<number | null>(null)

  const model = useMemo(() => {
    const valid = Uint8Array.from(names, (_, i) =>
      (i * 2654435761) % 100 < percent ? 1 : 0,
    )
    return buildAlphaModel(layout, valid)
  }, [names, layout, percent])

  return (
    <div
      style={{ maxWidth: 320, margin: '40px auto', display: 'grid', gap: 16 }}
    >
      <h1>Alphaslider demo</h1>
      <Alphaslider
        label="Name"
        names={names}
        model={model}
        value={value}
        onChange={setValue}
      />
      <label>
        Names with films: {percent}% ({model.validIdx.length.toLocaleString()}{' '}
        of {names.length.toLocaleString()})
        <input
          type="range"
          min={1}
          max={100}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </label>
      <p style={{ color: '#9aa3b2', fontSize: 13 }}>
        Click anywhere on the slide area to jump there. Drag the blue upper half
        of the thumb for coarse movement, the orange lower half for fine
        movement (one name per pixel). The arrow buttons step one name and
        repeat while held. Keys: arrows step, Page Up/Down jump a letter,
        Home/End, Escape clears. Lower the slider to see names without films
        being skipped.
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
)
