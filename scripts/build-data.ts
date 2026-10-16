import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IMDB_BASE_URL, IMDB_FILES, MAX_RAW_AGE_DAYS } from './lib/config.ts'
import { download, isFresh } from './lib/download.ts'
import {
  buildOutputs,
  collectCredits,
  loadRatings,
  neededNconsts,
  resolveNames,
  selectFilms,
} from './lib/pipeline.ts'
import type { TmdbRecord } from './lib/tmdb.ts'
import { readTsvGz } from './lib/tsv.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const rawDir = join(root, 'data', 'raw')
const outDir = join(root, 'public', 'data')
const tmdbCacheDir = join(root, 'data', 'cache', 'tmdb')

function log(message: string): void {
  console.log(`[build-data] ${message}`)
}

/** TMDB data fetched by `npm run enrich`, if any. Films without a cache file are left as NR. */
async function loadTmdbCache(ids: string[]): Promise<Map<string, TmdbRecord>> {
  const cache = new Map<string, TmdbRecord>()
  for (const id of ids) {
    try {
      cache.set(
        id,
        JSON.parse(
          await readFile(join(tmdbCacheDir, `${id}.json`), 'utf8'),
        ) as TmdbRecord,
      )
    } catch {
      // not fetched yet
    }
  }
  return cache
}

async function main(): Promise<void> {
  for (const file of IMDB_FILES) {
    const dest = join(rawDir, file)
    if (await isFresh(dest, MAX_RAW_AGE_DAYS)) {
      log(`${file}: cached`)
      continue
    }
    log(`${file}: downloading...`)
    await download(`${IMDB_BASE_URL}/${file}`, dest)
  }

  log('ratings...')
  const ratings = await loadRatings(
    readTsvGz(join(rawDir, 'title.ratings.tsv.gz')),
  )
  log(`  ${ratings.size} titles with enough votes`)

  log('basics...')
  const films = await selectFilms(
    readTsvGz(join(rawDir, 'title.basics.tsv.gz')),
    ratings,
  )
  log(`  ${films.length} films selected`)

  log('principals (large, takes a few minutes)...')
  const filmIndex = new Map(films.map((f, i) => [f.id, i]))
  const credits = await collectCredits(
    readTsvGz(join(rawDir, 'title.principals.tsv.gz')),
    filmIndex,
  )

  log('names...')
  const names = await resolveNames(
    readTsvGz(join(rawDir, 'name.basics.tsv.gz')),
    neededNconsts(credits),
  )
  log(`  ${names.size} people resolved`)

  const enrich = await loadTmdbCache(films.map((f) => f.id))
  log(
    `TMDB data for ${enrich.size} of ${films.length} films${enrich.size === 0 ? ' (run `npm run enrich`)' : ''}`,
  )

  const out = buildOutputs(films, credits, names, undefined, enrich)
  await mkdir(outDir, { recursive: true })
  for (const [name, data] of Object.entries(out)) {
    const path = join(outDir, `${name}.json`)
    await writeFile(path, JSON.stringify(data))
    log(`wrote ${path}`)
  }
  log(`done: ${JSON.stringify(out.meta.counts)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
