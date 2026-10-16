import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import type { Readable } from 'node:stream'

export type Row = Record<string, string>

/** IMDb marks missing values with \N. */
export const NULL = '\\N'

export function parseLine(line: string, headers: string[]): Row {
  const cells = line.split('\t')
  const row: Row = {}
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]!] = cells[i] ?? NULL
  }
  return row
}

/** Stream rows from a TSV text stream. The first line is the header. */
export async function* readTsv(input: Readable): AsyncGenerator<Row> {
  const lines = createInterface({ input, crlfDelay: Infinity })
  let headers: string[] | null = null
  for await (const line of lines) {
    if (headers === null) {
      headers = line.split('\t')
      continue
    }
    if (line === '') continue
    yield parseLine(line, headers)
  }
}

/** Stream rows from a gzipped TSV file without holding it in memory. */
export function readTsvGz(path: string): AsyncGenerator<Row> {
  return readTsv(createReadStream(path).pipe(createGunzip()))
}

export function parseIntOrNull(value: string | undefined): number | null {
  if (value === undefined || value === NULL) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

export function parseFloatOrNull(value: string | undefined): number | null {
  if (value === undefined || value === NULL) return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}
