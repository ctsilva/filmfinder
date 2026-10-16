import { expect, test, type Page } from '@playwright/test'
import { open, SAMPLE } from './helpers.ts'

/**
 * Input-to-redraw latency in a real browser. The query engine benchmark only times the
 * filtering; this also includes React, the valid-value computation for every widget and
 * the canvas redraw.
 *
 * Method: an input event is dispatched on the Year slider, and we wait for the starfield
 * to redraw (detected by wrapping the canvas's clearRect, called at the start of each
 * draw), then one more animation frame, so the figure is an upper bound that includes the
 * paint. The browser runs animation frames at the display rate, so up to about 17 ms of
 * every figure is waiting for the next frame and not work.
 */
async function measure(page: Page, runs: number): Promise<number[]> {
  return page.evaluate(async (n) => {
    const w = window as unknown as { __draws: number[] }
    w.__draws = []
    const proto = CanvasRenderingContext2D.prototype
    const original = proto.clearRect
    proto.clearRect = function (...args: Parameters<typeof original>) {
      w.__draws.push(performance.now())
      return original.apply(this, args)
    }
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Year minimum"]',
    )!
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!
    const frame = () =>
      new Promise<void>((r) => requestAnimationFrame(() => r()))
    const results: number[] = []
    // settle first
    await frame()
    await frame()
    for (let i = 0; i < n; i++) {
      // alternate between two positions so every run changes the query
      const target =
        i % 2 === 0 ? Number(input.max) - 40 : Number(input.min) + 5
      const before = w.__draws.length
      const t0 = performance.now()
      setValue.call(input, String(target))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      while (w.__draws.length === before) await frame()
      await frame() // the frame after the draw: by then the draw has been painted
      results.push(performance.now() - t0)
      await frame()
    }
    proto.clearRect = original
    return results
  }, runs)
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
  return { median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1]! }
}

test('input to redraw on the Wikidata sample stays under 100 ms', async ({
  page,
}) => {
  await open(page, SAMPLE)
  await expect(page.getByRole('slider', { name: 'Director' })).toBeVisible()
  const s = stats(await measure(page, 40))
  console.log(
    `sample: median ${s.median.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} ms, max ${s.max.toFixed(1)} ms`,
  )
  expect(s.p95).toBeLessThan(100)
})

test('input to redraw on the full IMDb data stays under 100 ms', async ({
  page,
  request,
}) => {
  const meta = await request.get('/data/meta.json')
  const usable =
    meta.ok() && (await meta.json().catch(() => null))?.version >= 3
  test.skip(
    !usable,
    'the full IMDb build (public/data) is not present or is out of date',
  )
  await open(page, '/')
  await expect(page.getByRole('slider', { name: 'Director' })).toBeVisible()
  const s = stats(await measure(page, 40))
  console.log(
    `full data: median ${s.median.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} ms, max ${s.max.toFixed(1)} ms`,
  )
  expect(s.p95).toBeLessThan(100)
})
