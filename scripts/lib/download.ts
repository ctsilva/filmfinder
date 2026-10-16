import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const DAY_MS = 24 * 60 * 60 * 1000

export async function isFresh(
  path: string,
  maxAgeDays: number,
): Promise<boolean> {
  try {
    const info = await stat(path)
    return Date.now() - info.mtimeMs < maxAgeDays * DAY_MS
  } catch {
    return false
  }
}

/** Download to a .part file, then rename, so an interrupted run never leaves a bad file. */
export async function download(url: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${url} -> HTTP ${res.status}`)
  }
  const part = `${dest}.part`
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(part))
  await rename(part, dest)
}
