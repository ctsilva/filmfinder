import { collationKey } from '../../src/engine/collation.ts'
import type { PeopleIndex } from '../../src/engine/schema.ts'

/** One credit of one person on one film. `id` is the source's person id (IMDb nconst, Wikidata QID). */
export interface PersonRecord {
  id: string
  /** Display name, "Last, First". */
  name: string
  /** Photo path for this person, if known from this film's data. */
  photo: string | null
}

/**
 * Build the people list for one role from every film's credits.
 *
 * People are identified by `id`, never by name, so two people called "John Smith"
 * stay two entries. Returns the list and, per film, each credited person's index in
 * it (in the film's billing order).
 */
export function buildPeopleIndex(perFilm: PersonRecord[][]): {
  index: PeopleIndex
  credits: number[][]
} {
  type Entry = { name: string; photo: string | null; films: number[] }
  const byId = new Map<string, Entry>()
  perFilm.forEach((people, film) => {
    for (const p of people) {
      let entry = byId.get(p.id)
      if (!entry) {
        entry = { name: p.name, photo: null, films: [] }
        byId.set(p.id, entry)
      }
      if (entry.films[entry.films.length - 1] !== film) entry.films.push(film)
      // Films are in popularity order, so the first photo found comes from the best-known film.
      if (entry.photo === null && p.photo) entry.photo = p.photo
    }
  })

  const keys = new Map<string, string>() // id -> collation key, computed once
  for (const [id, e] of byId) keys.set(id, collationKey(e.name))
  const ids = [...byId.keys()].sort((a, b) => {
    const ka = keys.get(a)!
    const kb = keys.get(b)!
    if (ka !== kb) return ka < kb ? -1 : 1
    const na = byId.get(a)!.name
    const nb = byId.get(b)!.name
    if (na !== nb) return na < nb ? -1 : 1
    return a < b ? -1 : a > b ? 1 : 0
  })

  const position = new Map(ids.map((id, i) => [id, i]))
  const index: PeopleIndex = {
    names: ids.map((id) => byId.get(id)!.name),
    films: ids.map((id) => byId.get(id)!.films),
    photos: ids.map((id) => byId.get(id)!.photo),
  }
  const credits = perFilm.map((people) => {
    const seen = new Set<number>()
    const list: number[] = []
    for (const p of people) {
      const at = position.get(p.id)!
      if (!seen.has(at)) {
        seen.add(at)
        list.push(at)
      }
    }
    return list
  })
  return { index, credits }
}
