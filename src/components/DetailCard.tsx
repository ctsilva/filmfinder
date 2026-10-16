import { useEffect, useRef } from 'react'
import { placeCard, type Point, type Size } from '../engine/cardPlacement.ts'
import { imageUrl } from '../engine/meta.ts'
import { CERT_LABELS } from '../store/queryState.ts'
import { useApp } from '../store/useApp.ts'

export const CARD_SIZE: Size = { w: 420, h: 420 }

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })

function safeName(names: Intl.DisplayNames, code: string): string {
  try {
    return names.of(code) ?? code
  } catch {
    return code
  }
}

export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}

interface Props {
  film: number
  /** Screen position of the selected star inside the container. */
  anchor: Point
  container: Size
}

/** Film details on demand. Names in the cast lists search for that person's films when clicked. */
export function DetailCard({ film, anchor, container }: Props) {
  const films = useApp((s) => s.films)!
  const meta = useApp((s) => s.meta)
  const credits = useApp((s) => s.credits)
  const indexes = useApp((s) => s.indexes)
  const peopleStatus = useApp((s) => s.peopleStatus)
  const loadPeople = useApp((s) => s.loadPeople)
  const loadCredits = useApp((s) => s.loadCredits)
  const creditsStatus = useApp((s) => s.creditsStatus)
  const selectPerson = useApp((s) => s.selectPerson)
  const setSelected = useApp((s) => s.setSelected)
  const selectedVia = useApp((s) => s.selectedVia)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadCredits()
  }, [loadCredits])

  // Opened from the keyboard-operable list: move focus into the card so the person links are next.
  useEffect(() => {
    if (selectedVia === 'list') ref.current?.focus()
  }, [film, selectedVia])

  // Close on Escape, or on a press outside the card (presses on the starfield are handled there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(-1)
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (ref.current?.contains(target) || target.tagName === 'CANVAS') return
      setSelected(-1)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [setSelected])

  const pos = placeCard(anchor, container, CARD_SIZE)
  const cert = films.cert[film]!
  const poster = films.poster[film]
  const country = films.country[film]
  const language = films.language[film]

  const images = meta?.images

  type Kind = 'actor' | 'actress' | 'director'
  const credited: Record<Kind, number[] | undefined> = {
    director: credits?.directors[film],
    actor: credits?.actors[film],
    actress: credits?.actresses[film],
  }

  /** One person: photo, and a button that searches for their films. `who` indexes the people list. */
  const person = (kind: Kind, who: number) => {
    const people = indexes[kind]!
    const photo = people.photos?.[who]
    const name = people.names[who]!
    return (
      <>
        {images &&
          (photo ? (
            <img
              className="avatar"
              src={imageUrl(images.avatar, photo)}
              alt=""
              width={24}
              height={36}
              loading="lazy"
            />
          ) : (
            <span className="avatar empty" aria-hidden="true" />
          ))}
        <button
          type="button"
          className="person"
          onClick={() => selectPerson(kind, who)}
        >
          {name}
        </button>
      </>
    )
  }

  const retry = (what: string, run: () => Promise<void>) => (
    <span className="muted">
      could not load {what}{' '}
      <button type="button" className="link" onClick={() => void run()}>
        Retry
      </button>
    </span>
  )

  const list = (kind: Kind) => {
    const ids = credited[kind]
    if (creditsStatus === 'error' && ids === undefined) {
      return retry('the cast', loadCredits)
    }
    if (peopleStatus === 'error' && !indexes[kind]) {
      return retry('the names', loadPeople)
    }
    if (ids === undefined || !indexes[kind]) {
      return <span className="muted">loading…</span>
    }
    if (ids.length === 0) return <span className="muted">none listed</span>
    return (
      <ul>
        {ids.map((who) => (
          <li key={who}>{person(kind, who)}</li>
        ))}
      </ul>
    )
  }

  return (
    <div
      ref={ref}
      className="card"
      tabIndex={-1}
      role="dialog"
      aria-label={`${films.title[film]} details`}
      style={{
        left: pos.x,
        top: pos.y,
        width: CARD_SIZE.w,
        maxHeight: CARD_SIZE.h,
      }}
    >
      <button
        type="button"
        className="card-close"
        aria-label="Close"
        onClick={() => setSelected(-1)}
      >
        ×
      </button>
      <h2>
        {films.title[film]} <span className="muted">({films.year[film]})</span>
      </h2>
      <div className="card-body">
        {poster && images && (
          <img
            className="poster"
            src={imageUrl(images.poster, poster)}
            alt={`Poster of ${films.title[film]}`}
            width={92}
          />
        )}
        <dl>
          <dt>Director</dt>
          <dd>{list('director')}</dd>
          {meta?.hasRating ? (
            <>
              <dt>Rating</dt>
              <dd>
                {films.rating[film]!.toFixed(1)}{' '}
                <span className="muted">
                  ({films.votes[film]!.toLocaleString()} {meta.popularityLabel})
                </span>
              </dd>
            </>
          ) : (
            <>
              <dt>Popularity</dt>
              <dd>
                {films.votes[film]!.toLocaleString()}{' '}
                <span className="muted">{meta?.popularityLabel}</span>
              </dd>
            </>
          )}
          <dt>Length</dt>
          <dd>
            {formatRuntime(films.length[film]!)}
            {cert !== 4 && (
              <span className="muted"> · {CERT_LABELS[cert]}</span>
            )}
          </dd>
          {(country || language) && (
            <>
              <dt>Country</dt>
              <dd>{country ? safeName(regionNames, country) : '—'}</dd>
              <dt>Language</dt>
              <dd>{language ? safeName(languageNames, language) : '—'}</dd>
            </>
          )}
          <dt>Actors</dt>
          <dd>{list('actor')}</dd>
          <dt>Actresses</dt>
          <dd>{list('actress')}</dd>
        </dl>
      </div>
    </div>
  )
}
