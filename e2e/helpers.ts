import { expect, type Page } from '@playwright/test'

/** The committed Wikidata sample, so the tests run on a fresh clone. */
export const SAMPLE = '/?data=sample'

/**
 * Which dataset the interaction tests use. The sample by default; set E2E_DATA=full to run
 * them on your own IMDb + TMDB build (public/data/), which is larger and has real ratings.
 */
export const DATA = process.env.E2E_DATA === 'full' ? '/' : SAMPLE

export async function open(page: Page, url = DATA): Promise<void> {
  await page.goto(url)
  await expect(page.locator('.count')).toContainText(' of ')
}

/** Number of films matching the current query, from the "N of M films" line. */
export async function matching(page: Page): Promise<number> {
  const text = await page.locator('.count').innerText()
  const match = /^([\d,]+) of ([\d,]+)/.exec(text)
  if (!match) throw new Error(`Unexpected count text: ${text}`)
  return Number(match[1]!.replace(/,/g, ''))
}

export async function total(page: Page): Promise<number> {
  const text = await page.locator('.count').innerText()
  return Number(/of ([\d,]+)/.exec(text)![1]!.replace(/,/g, ''))
}

/** Wait until the query has settled: the count stops changing for a few frames. */
export async function settled(page: Page): Promise<number> {
  let last = await matching(page)
  for (let i = 0; i < 20; i++) {
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    )
    const now = await matching(page)
    if (now === last) return now
    last = now
  }
  return last
}
