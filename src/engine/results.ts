/**
 * The first `limit` films that pass the query, in film order. Films are stored most
 * popular first, so these are the best-known matches.
 */
export function firstResults(mask: Uint8Array, limit: number): number[] {
  const out: number[] = []
  for (let i = 0; i < mask.length && out.length < limit; i++) {
    if (mask[i] !== 0) out.push(i)
  }
  return out
}
