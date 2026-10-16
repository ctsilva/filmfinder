import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assembleFilms,
  attributesQuery,
  buildWikidataOutputs,
  coreQuery,
  DEFAULT_MIN_SITELINKS,
  filmListQuery,
  parseAttributes,
  parseCore,
  parseFilmList,
  buildFilmPeople,
  parsePersons,
  parseRelations,
  personQuery,
  relationsQuery,
  WIKIDATA_ENDPOINT,
  type Binding,
} from './lib/wikidata.ts'

/**
 * Build a dataset from Wikidata (CC0) instead of IMDb.
 *
 *   npm run build-wikidata -- [--min-sitelinks 30] [--out public/sample-data]
 *
 * Films are those with a release date, a runtime and at least N Wikipedia language
 * editions. Queries are sent politely, one at a time, and every response is cached in
 * data/cache/wikidata/ so a failed run resumes where it stopped.
 *
 * Wikimedia asks clients to identify themselves. Set WIKIDATA_USER_AGENT in .env
 * (for example "FilmFinderClass/1.0 (you@example.org)") if you run this a lot.
 */

/** Films per batch for the film queries, and people per batch for the person details. */
const FILM_BATCH = 100
const PERSON_BATCH = 300
const PAUSE_MS = 1200

const root = fileURLToPath(new URL('..', import.meta.url))
const cacheDir = join(root, 'data', 'cache', 'wikidata')

const log = (m: string) => console.log(`[wikidata] ${m}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback)
}

let userAgent = 'FilmFinderReproduction/1.0 (educational class project)'

/** Run a SPARQL query, retrying timeouts and rate limits, and cache the result by query text. */
async function sparql(query: string): Promise<Binding[]> {
  const key = createHash('sha1').update(query).digest('hex')
  const file = join(cacheDir, `${key}.json`)
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Binding[]
  } catch {
    // not cached
  }

  for (let attempt = 0; ; attempt++) {
    await sleep(PAUSE_MS)
    let res: Response | null = null
    try {
      res = await fetch(WIKIDATA_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/sparql-results+json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': userAgent,
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(90_000),
      })
    } catch {
      // network error or timeout: retry below
    }
    if (res?.ok) {
      const rows = ((await res.json()) as { results: { bindings: Binding[] } })
        .results.bindings
      await writeFile(file, JSON.stringify(rows))
      return rows
    }
    if (attempt >= 6)
      throw new Error(
        `Wikidata query failed after retries (HTTP ${res?.status ?? 'none'})`,
      )
    const wait = Number(res?.headers.get('retry-after')) || 4 * 2 ** attempt
    log(`  HTTP ${res?.status ?? 'error'}, retrying in ${wait}s`)
    await sleep(wait * 1000)
  }
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(join(root, '.env'))
  } catch {
    // no .env is fine
  }
  if (process.env.WIKIDATA_USER_AGENT)
    userAgent = process.env.WIKIDATA_USER_AGENT

  const minSitelinks = Number(
    arg('min-sitelinks', String(DEFAULT_MIN_SITELINKS)),
  )
  const outDir = join(root, arg('out', join('public', 'sample-data')))
  await mkdir(cacheDir, { recursive: true })
  await mkdir(outDir, { recursive: true })

  log(`listing films with at least ${minSitelinks} Wikipedia editions...`)
  const list = parseFilmList(await sparql(filmListQuery(minSitelinks)))
  const ids = [...list.keys()].sort()
  log(`${ids.length} films`)

  const core: Binding[] = []
  const attrs: Binding[] = []
  const links: Binding[] = []
  const filmBatches = Math.ceil(ids.length / FILM_BATCH)
  for (let b = 0; b < filmBatches; b++) {
    const chunk = ids.slice(b * FILM_BATCH, (b + 1) * FILM_BATCH)
    core.push(...(await sparql(coreQuery(chunk))))
    attrs.push(...(await sparql(attributesQuery(chunk))))
    links.push(...(await sparql(relationsQuery(chunk))))
    log(`films: batch ${b + 1}/${filmBatches}`)
  }

  const relations = parseRelations(links)
  const personIds = [
    ...new Set(
      [...relations.values()].flatMap((r) => [...r.directors, ...r.cast]),
    ),
  ].sort()
  log(`${personIds.length} people to look up`)
  const personRows: Binding[] = []
  const personBatches = Math.ceil(personIds.length / PERSON_BATCH)
  for (let b = 0; b < personBatches; b++) {
    personRows.push(
      ...(await sparql(
        personQuery(personIds.slice(b * PERSON_BATCH, (b + 1) * PERSON_BATCH)),
      )),
    )
    if ((b + 1) % 10 === 0 || b + 1 === personBatches)
      log(`people: batch ${b + 1}/${personBatches}`)
  }

  const films = assembleFilms(
    list,
    parseCore(core),
    parseAttributes(attrs),
    buildFilmPeople(relations, parsePersons(personRows)),
  )
  log(
    `${films.length} films kept (${ids.length - films.length} dropped for lacking an English title, a year or a runtime)`,
  )

  const out = buildWikidataOutputs(films)
  for (const [name, data] of Object.entries(out)) {
    await writeFile(join(outDir, `${name}.json`), JSON.stringify(data))
  }
  log(`wrote ${outDir}`)
  log(`done: ${JSON.stringify(out.meta.counts)}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
