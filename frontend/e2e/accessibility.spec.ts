import { expect, type Locator, type Page, test } from '@playwright/test'

const ADMIN_KEY = process.env.E2E_ADMIN_KEY ?? 'e2e-admin-key-0123456789'

/** Press Tab until `target` has focus (fails if it is not reachable by keyboard). */
async function tabTo(page: Page, target: Locator, maxPresses = 60) {
  for (let i = 0; i < maxPresses; i++) {
    if (await target.evaluate(el => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Not reachable with Tab: ${target}`)
}

const isFocused = (locator: Locator) => locator.evaluate(el => el === document.activeElement)

test.describe('keyboard-only walkthrough', () => {
  test('report → error summary → submit → track, using only the keyboard', async ({ page }) => {
    await page.goto('/')

    // Skip link is the first tab stop and moves focus into <main>.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()

    const pothole = page.getByRole('button', { name: 'Category: Pothole' })
    await tabTo(page, pothole)
    await page.keyboard.press('Space')
    await expect(pothole).toHaveAttribute('aria-pressed', 'true')

    await tabTo(page, page.getByLabel(/Issue Title/))
    await page.keyboard.type('ab')

    // Location via the keyboard-accessible coordinate inputs.
    await tabTo(page, page.getByLabel('Latitude coordinate'))
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('12.9100')
    await page.keyboard.press('Tab')
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('77.7100')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Location selected: 12.9100, 77.7100/)).toBeVisible()

    // Invalid submit: focus moves to the error summary; fields are flagged.
    await tabTo(page, page.getByRole('button', { name: /Submit Report/ }))
    await page.keyboard.press('Enter')
    const summary = page.getByRole('alert', { name: /Please fix the following/ })
    await expect(summary).toBeFocused()
    await expect(page.getByLabel(/Issue Title/)).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel(/Describe the Issue/)).toHaveAttribute('aria-describedby', 'error-description')

    // Follow the summary link back to the field and fix it.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Title must be at least 3 characters' })).toBeFocused()
    await page.keyboard.press('Enter')
    await page.getByLabel(/Issue Title/).focus() // anchor target; browsers differ on focusing it
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type(`Keyboard pothole ${Date.now()}`)
    await page.keyboard.press('Tab')
    await page.keyboard.type('Deep pothole by the bus stop; scooters swerve into traffic.')

    await tabTo(page, page.getByRole('button', { name: /Submit Report/ }))
    await page.keyboard.press('Enter')

    // Result view replaces the form, so focus lands on its heading.
    await expect(page.getByRole('heading', { name: 'Report Submitted!' })).toBeFocused()
    await tabTo(page, page.getByRole('button', { name: /Track My Report/ }))
    await page.keyboard.press('Enter')

    // After client-side navigation focus is moved to <main> and the page is announced.
    await expect(page).toHaveURL(/\/track\//)
    await expect(page.locator('#main')).toBeFocused()
    await expect(page.getByRole('status').filter({ hasText: 'page loaded' })).toHaveText(/page loaded$/)
  })

  test('admin can sign in and switch dashboard tabs with the keyboard', async ({ page }) => {
    await page.goto('/admin/login')
    await tabTo(page, page.getByLabel(/Admin Secret Key/))
    await page.keyboard.type(ADMIN_KEY)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/admin$/)

    const queueTab = page.getByRole('tab', { name: /Queue/ })
    await tabTo(page, queueTab)
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: /Analytics/ })).toBeFocused()
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-analytics')
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: /SLA Breaches/ })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(queueTab).toBeFocused()

    // Row controls are reachable and labelled.
    const firstRowCheckbox = page.getByRole('checkbox', { name: /^Select report / }).first()
    await tabTo(page, firstRowCheckbox, 120)
    await page.keyboard.press('Space')
    await expect(firstRowCheckbox).toBeChecked()
    await expect(page.getByRole('region', { name: 'Bulk actions' })).toBeVisible()
    expect(await isFocused(firstRowCheckbox)).toBe(true)
  })
})

test.describe('touch targets on touch screens', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  /** Every visible, non-inline interactive element must be at least 44×44 CSS px. */
  async function smallTargets(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const out: string[] = []
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>('a, button, select, input, textarea, [role=tab]'),
      )) {
        const style = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        if (style.display === 'inline' || style.visibility === 'hidden' || r.width <= 1 || r.height <= 1) continue
        if (el.closest('.leaflet-control-attribution')) continue // inline attribution text links
        if (r.width < 44 || r.height < 44) {
          out.push(
            `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(r.width)}×${Math.round(r.height)}`,
          )
        }
      }
      return out
    })
  }

  test('public pages', async ({ page, request }) => {
    const [first] = await (await request.get('/api/reports?limit=1')).json()
    for (const path of ['/', '/map', '/admin/login', `/track/${first.id}`]) {
      await page.goto(path)
      await expect(page.locator('main h1, main h2').first()).toBeVisible()
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
      expect(await smallTargets(page), path).toEqual([])
    }
  })

  test('admin pages', async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByLabel(/Admin Secret Key/).fill(ADMIN_KEY)
    await page.getByRole('button', { name: /Sign in/ }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('table')).toBeVisible()
    expect(await smallTargets(page), '/admin').toEqual([])
    await page.goto('/admin/heatmap')
    await expect(page.getByRole('img', { name: /Issue heatmap/ })).toBeAttached()
    expect(await smallTargets(page), '/admin/heatmap').toEqual([])
  })
})
