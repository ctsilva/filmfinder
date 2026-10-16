import { expect, test } from '@playwright/test'
import { matching, open, settled, total } from './helpers.ts'

test.describe('tight coupling', () => {
  test('range sliders cannot be moved to a range with no films', async ({
    page,
  }) => {
    await open(page)
    const director = page.getByRole('slider', { name: 'Director' })
    await expect(director).toBeVisible() // the people lists have loaded
    await director.focus()
    await page.keyboard.press('ArrowRight') // first director that has films
    const withDirector = await settled(page)
    expect(withDirector).toBeGreaterThan(0)
    expect(withDirector).toBeLessThan(await total(page))

    // Try to push each Year thumb past the years that have films: the count must never reach 0.
    const yearMin = page.getByLabel('Year minimum')
    const yearMax = page.getByLabel('Year maximum')
    await yearMin.focus()
    await page.keyboard.press('End')
    expect(await settled(page)).toBeGreaterThan(0)
    await page.keyboard.press('Home')
    expect(await settled(page)).toBeGreaterThan(0)
    await yearMax.focus()
    await page.keyboard.press('Home')
    expect(await settled(page)).toBeGreaterThan(0)
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('PageUp')
      expect(await settled(page)).toBeGreaterThan(0)
    }
    // and the same for the length slider
    await page.getByLabel('Length minimum').focus()
    await page.keyboard.press('End')
    expect(await settled(page)).toBeGreaterThan(0)
  })

  test('the alphaslider only lands on names that still have films', async ({
    page,
  }) => {
    await open(page)
    const actor = page.getByRole('slider', { name: 'Actor' })
    await expect(actor).toBeVisible()
    await actor.focus()
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('ArrowRight')
      expect(await settled(page)).toBeGreaterThan(0)
    }
    await page.keyboard.press('Escape') // clears the slider
    await expect(actor).toHaveAttribute('aria-valuetext', 'ALL')
    expect(await settled(page)).toBe(await total(page))
  })
})

test.describe('keyboard-only exploration', () => {
  test('filter, choose a film, inspect it, follow a person, reset', async ({
    page,
  }) => {
    await open(page)
    const everything = await total(page)

    // filter with the keyboard: turn one genre off
    await page.getByRole('button', { name: 'Horror' }).focus()
    await page.keyboard.press('Enter')
    expect(await settled(page)).toBeLessThan(everything)

    // choose a film from the list
    const first = page.locator('.result').first()
    await first.focus()
    await page.keyboard.press('Enter')
    const card = page.getByRole('dialog')
    await expect(card).toBeVisible()
    await expect(card).toBeFocused()

    // inspect: the director's name is a button, once the cast has loaded
    const person = card.locator('.person').first()
    await expect(person).toBeVisible()
    const name = (await person.innerText()).trim()

    // follow the person: their films replace the query, and the card closes
    await person.focus()
    await page.keyboard.press('Enter')
    await expect(card).toBeHidden()
    const theirs = await settled(page)
    expect(theirs).toBeGreaterThan(0)
    expect(theirs).toBeLessThan(everything)
    await expect(
      page.locator('.alpha-value', { hasText: name.split(' · ')[0]! }).first(),
    ).toBeVisible()

    // the genre we switched off was reset too (associative search starts a fresh query)
    await expect(page.getByRole('button', { name: 'Horror' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // reset the person: the alphaslider's clear button
    const clear = page
      .getByRole('button', { name: /^Clear (Actor|Actress|Director)$/ })
      .and(page.locator(':enabled'))
    await clear.first().focus()
    await page.keyboard.press('Enter')
    expect(await settled(page)).toBe(everything)
  })

  test('closing a card opened from the list returns focus to that list item', async ({
    page,
  }) => {
    await open(page)
    const item = page.locator('.result').nth(2)
    await item.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(item).toBeFocused()
  })

  test('the list follows the query', async ({ page }) => {
    await open(page)
    const all = await page.locator('.result').count()
    expect(all).toBeGreaterThan(0)
    await page.getByRole('slider', { name: 'Director' }).focus()
    await page.keyboard.press('ArrowRight')
    await settled(page)
    const n = await matching(page)
    await expect(page.locator('.result')).toHaveCount(Math.min(50, n))
  })
})

test.describe('failures show up and can be retried', () => {
  test('people lists', async ({ page }) => {
    await page.route('**/people.json', (route) => route.abort())
    await open(page)
    await expect(page.getByText('could not load names').first()).toBeVisible()
    await page.unroute('**/people.json')
    await page.getByRole('button', { name: 'Retry' }).first().click()
    await expect(page.getByRole('slider', { name: 'Director' })).toBeVisible()
    await expect(page.getByText('could not load names')).toHaveCount(0)
  })

  test('cast lists in the detail card', async ({ page }) => {
    await page.route('**/credits.json', (route) => route.abort())
    await open(page)
    await page.locator('.result').first().click()
    const card = page.getByRole('dialog')
    await expect(
      card.getByText('could not load the cast').first(),
    ).toBeVisible()
    await page.unroute('**/credits.json')
    await card.getByRole('button', { name: 'Retry' }).first().click()
    await expect(card.locator('.person').first()).toBeVisible()
  })

  test('the rest of the application keeps working when a list fails', async ({
    page,
  }) => {
    await page.route('**/people.json', (route) => route.abort())
    await open(page)
    await page.getByRole('button', { name: 'Horror' }).click()
    expect(await settled(page)).toBeLessThan(await total(page))
    await expect(page.locator('canvas')).toBeVisible()
  })
})
