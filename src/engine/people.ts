import type { PeopleIndex } from './schema.ts'

/**
 * Display labels for a people list. Distinct people with the same name get their
 * best-known film appended ("Smith, John · Some Film"), so they can be told apart;
 * everyone else keeps the plain name. Names are sorted, so namesakes are adjacent.
 * Films are stored most popular first, so a person's first film is their best known.
 */
export function personLabels(
  index: PeopleIndex,
  filmTitles: readonly string[],
): string[] {
  const { names, films } = index
  const labels = names.slice()
  let start = 0
  while (start < names.length) {
    let end = start + 1
    while (end < names.length && names[end] === names[start]) end++
    if (end - start > 1) {
      const seen = new Map<string, number>()
      for (let i = start; i < end; i++) {
        const film = films[i]?.[0]
        let label =
          film === undefined
            ? names[i]!
            : `${names[i]} · ${filmTitles[film] ?? ''}`
        const count = (seen.get(label) ?? 0) + 1
        seen.set(label, count)
        // even the best-known film can be shared by two namesakes: number them
        if (count > 1) label = `${label} (${count})`
        labels[i] = label
      }
    }
    start = end
  }
  return labels
}
