/** Case- and accent-insensitive sort key, so "Éric" files under E. */
export function collationKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
