/**
 * Display forms used by the alphasliders, as in the FilmFinder paper:
 * people as "Last, First" and titles with a leading article moved to the end
 * ("Magician, The").
 */

const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v'])
const PARTICLES = new Set([
  'van',
  'von',
  'de',
  'di',
  'da',
  'del',
  'della',
  'der',
  'den',
  'du',
  'la',
  'le',
  'dos',
  'das',
  'bin',
  'ibn',
  'al',
  'el',
  'st.',
  'ter',
  'ten',
])

/**
 * "Ingmar Bergman" -> "Bergman, Ingmar". Keeps suffixes after the first name
 * ("Robert Downey Jr." -> "Downey, Robert Jr.") and attaches particles to the
 * surname ("Ludwig van Beethoven" -> "van Beethoven, Ludwig"). IMDb stores
 * given name first, so for names written family-name-first the last word is
 * taken as the surname.
 */
export function lastFirst(name: string): string {
  const tokens = name.trim().split(/\s+/)
  if (tokens.length < 2 || name.includes(',')) return name.trim()

  const suffix: string[] = []
  while (
    tokens.length > 2 &&
    SUFFIXES.has(tokens[tokens.length - 1]!.toLowerCase())
  ) {
    suffix.unshift(tokens.pop()!)
  }
  let split = tokens.length - 1
  while (split > 1 && PARTICLES.has(tokens[split - 1]!.toLowerCase())) split--
  const surname = tokens.slice(split).join(' ')
  const given = [...tokens.slice(0, split), ...suffix].join(' ')
  return `${surname}, ${given}`
}

/** "The Magician" -> "Magician, The"; "A Lesson in Love" -> "Lesson in Love, A". */
export function titleSortForm(title: string): string {
  const match = /^(the|an|a)\s+(.+)$/i.exec(title)
  return match ? `${match[2]}, ${match[1]}` : title
}
