import { expect, test } from '@playwright/test'

const ADMIN_KEY = process.env.E2E_ADMIN_KEY ?? 'e2e-admin-key-0123456789'

test('citizen reports an issue → tracks it → admin updates status → citizen sees the change', async ({ page }) => {
  const title = `E2E pothole ${Date.now()}`

  // 1. Citizen reports a civic issue (keyboard-accessible coordinate entry instead of a map click).
  await page.goto('/')
  await page.getByRole('button', { name: 'Category: Pothole' }).click()
  await page.getByLabel(/Issue Title/).fill(title)
  await page
    .getByLabel(/Describe the Issue/)
    .fill('Deep pothole near the bus stop, two-wheelers swerving into traffic.')
  await page.getByLabel('Latitude coordinate').fill('12.9000')
  await page.getByLabel('Longitude coordinate').fill('77.7000')
  await page.getByRole('button', { name: 'Use these manual coordinates for the report' }).click()
  await page.getByRole('button', { name: /Submit Report/ }).click()

  // 2. Gemini (mock mode in CI) categorizes, scores urgency and recommends a department.
  await expect(page.getByRole('heading', { name: 'Report Submitted!' })).toBeVisible()
  await expect(page.getByText('PWD', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Track My Report/ }).click()

  // 3. Tracking page shows the report and its initial status.
  await expect(page).toHaveURL(/\/track\//)
  const trackUrl = page.url()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(page.getByText('Reported', { exact: true }).first()).toBeVisible()

  // 4. Admin signs in and moves the issue to "acknowledged".
  await page.goto('/admin/login')
  await page.getByLabel(/Admin Secret Key/).fill(ADMIN_KEY)
  await page.getByRole('button', { name: /Sign in/ }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.getByLabel(`New status for ${title}`).selectOption('acknowledged')
  await page.getByRole('button', { name: `Apply status to ${title}` }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Status updated' })).toHaveText(
    'Status updated to acknowledged.',
  )

  // 5. The public tracking page reflects the resolution progress.
  await page.goto(trackUrl)
  await expect(page.getByText('Acknowledged', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Status updated to acknowledged')).toBeVisible()
})
