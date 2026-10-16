import { collationKey } from './collation.ts'
import { titleSortForm } from './names.ts'
import type { FilmsFile, PeopleIndex } from './schema.ts'

/** Inverted index for the Title alphaslider: one entry per distinct title, sorted. */
export function buildTitleIndex(films: Pick<FilmsFile, 'title'>): PeopleIndex {
  const byTitle = new Map<string, number[]>()
  films.title.forEach((title, i) => {
    const form = titleSortForm(title)
    const list = byTitle.get(form)
    if (list) list.push(i)
    else byTitle.set(form, [i])
  })
  const keyed = [...byTitle.keys()].map((name) => ({
    name,
    key: collationKey(name),
  }))
  keyed.sort((a, b) =>
    a.key < b.key
      ? -1
      : a.key > b.key
        ? 1
        : a.name < b.name
          ? -1
          : a.name > b.name
            ? 1
            : 0,
  )
  const names = keyed.map((k) => k.name)
  return { names, films: names.map((n) => byTitle.get(n)!) }
}
