import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FilmsFile } from '../src/engine/schema.ts'
import {
  fetchFilm,
  makeLimiter,
  TmdbAuthError,
  type TmdbAuth,
} from './lib/tmdb.ts'

/**
 * Fetch certification, poster, language and country for each film from TMDB.
 * Results are cached one file per film in data/cache/tmdb/, so the run is
 * resumable (Ctrl+C is safe) and re-running only fetches what is missing.
 *
 *   npm run enrich -- [--limit N]
 *
 * Credentials come from .env (TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY). They are never printed.
 */

const RATE_PER_SECOND = 30
const CONCURRENCY = 16

const root = fileURLToPath(new URL('..', import.meta.url))
const cacheDir = join(root, 'data', 'cache', 'tmdb')

function log(message: string): void {
  console.log(`[enrich] ${message}`)
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function parseLimit(): number {
  const i = process.argv.indexOf('--limit')
  if (i === -1) return Infinity
  const n = Number(process.argv[i + 1])
  if (!Number.isInteger(n) || n < 1)
    throw new Error('--limit needs a positive integer')
  return n
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(join(root, '.env'))
  } catch {
    // no .env: fall through to the check below
  }
  const auth: TmdbAuth = {
    token: process.env.TMDB_READ_ACCESS_TOKEN || undefined,
    apiKey: process.env.TMDB_API_KEY || undefined,
  }
  if (!auth.token && !auth.apiKey) {
    throw new Error(
      'No TMDB credentials: fill in TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY in .env',
    )
  }
  log(`using ${auth.token ? 'read access token' : 'API key'}`)

  const films = JSON.parse(
    await readFile(join(root, 'public', 'data', 'films.json'), 'utf8'),
  ) as FilmsFile
  await mkdir(cacheDir, { recursive: true })

  // films.json is sorted most-voted first, so a limited run covers the most popular films.
  const max = parseLimit()
  const todo: string[] = []
  let cached = 0
  for (const id of films.id) {
    if (await exists(join(cacheDir, `${id}.json`))) cached++
    else if (todo.length < max) todo.push(id)
  }
  log(`${cached} of ${films.count} already cached; fetching ${todo.length}`)

  const limit = makeLimiter(RATE_PER_SECOND)
  let next = 0
  let done = 0
  let found = 0
  let rated = 0
  const started = Date.now()
  let failure: unknown = null

  const worker = async () => {
    while (failure === null) {
      const i = next++
      if (i >= todo.length) return
      const id = todo[i]!
      try {
        const record = await fetchFilm(id, auth, limit)
        await writeFile(join(cacheDir, `${id}.json`), JSON.stringify(record))
        if (record.found) found++
        if (record.usCertification) rated++
      } catch (err) {
        failure = err
        return
      }
      done++
      if (done % 500 === 0) {
        const perSec = done / ((Date.now() - started) / 1000)
        const eta = Math.round((todo.length - done) / perSec / 60)
        log(
          `${done}/${todo.length} (${found} found, ${rated} with a US certification), about ${eta} min left`,
        )
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  if (failure) {
    if (failure instanceof TmdbAuthError)
      log(failure.message + '. Check the values in .env.')
    throw failure
  }
  log(
    `done: ${done} fetched, ${found} found on TMDB, ${rated} with a US certification`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
