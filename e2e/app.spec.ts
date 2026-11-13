import { test, expect } from '@playwright/test'
import { instrument, openApp, shoot, dumpDiagnostics, WORKER } from './helpers'

test.describe('BusinessFlow AI — live public acceptance', () => {
  test('inquiry → classify → grounded draft → approve → sandbox activity persists; escalation works', async ({ page, browser }, testInfo) => {
    const probe = instrument(page)
    const project = testInfo.project.name

    await openApp(page)
    await expect(page).toHaveTitle(/BusinessFlow/i)
    await expect(page.getByRole('heading', { name: 'Customer Inquiry Intake' })).toBeVisible()
    await expect(page.getByTestId('sandbox-panel')).toBeVisible()
    await expect(page.getByText('Refunds are available within 30 days')).toBeVisible({ timeout: 45_000 })
    expect(probe.workerCalls.some((c) => c.url.endsWith('/api/policies') && c.status === 200)).toBeTruthy()
    await shoot(page, '01-intake', project)

    const marker = `E2E-${Date.now()}`
    await page.getByPlaceholder(/I need a refund for my order/).fill(
      `I need a refund for order ${marker}, I was double charged.`
    )
    await page.getByRole('button', { name: 'Submit Inquiry' }).click()

    await expect(page.getByRole('heading', { name: 'Inquiry Detail' })).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText(marker)).toBeVisible()
    await expect(page.getByText('billing', { exact: true })).toBeVisible()
    expect(probe.workerCalls.some((c) => c.url.endsWith('/api/inquiries') && c.method === 'POST' && c.status === 200)).toBeTruthy()
    await shoot(page, '02-classified', project)

    // Draft must cite an approved policy.
    await page.getByRole('button', { name: 'Generate Draft', exact: true }).click()
    await expect(page.getByText('Draft Reply')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText(/Source: pol-billing-1/)).toBeVisible()
    await expect(page.getByText(/Based on our policy/)).toBeVisible()
    await shoot(page, '03-grounded-draft', project)

    await page.getByRole('button', { name: 'Approve Reply' }).click()
    await expect(page.getByRole('heading', { name: 'Customer Inquiry Intake' })).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('sandbox-panel').getByText('sandbox reply approved').first()).toBeVisible({ timeout: 45_000 })
    await shoot(page, '04-approved-sandbox', project)

    // Persistence: records survive a reload for this visitor.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('nav')).toBeVisible()
    await expect(page.getByText(marker)).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('sandbox-panel').getByText('sandbox reply approved').first()).toBeVisible()
    await shoot(page, '05-after-reload', project)

    // Escalation path.
    await page.getByPlaceholder(/I need a refund for my order/).fill(`Please escalate dispute ${marker}-B to a manager.`)
    await page.getByRole('button', { name: 'Submit Inquiry' }).click()
    await expect(page.getByRole('heading', { name: 'Inquiry Detail' })).toBeVisible({ timeout: 45_000 })
    await page.getByRole('button', { name: 'Generate Draft', exact: true }).click()
    await expect(page.getByText('Draft Reply')).toBeVisible({ timeout: 45_000 })
    await page.getByRole('button', { name: 'Escalate' }).click()
    await expect(page.getByTestId('sandbox-panel').getByText('sandbox escalation recorded').first()).toBeVisible({ timeout: 45_000 })
    await shoot(page, '06-escalated', project)

    // Second isolated visitor must not see this visitor's inquiries or activity.
    const session = await page.evaluate(() => localStorage.getItem('demo-session-id'))
    const otherCtx = await browser.newContext()
    const other = await otherCtx.newPage()
    await openApp(other)
    const otherSession = await other.evaluate(() => localStorage.getItem('demo-session-id'))
    expect(otherSession).not.toEqual(session)
    await expect(other.getByText(marker)).toHaveCount(0)
    const otherInq = await (await other.request.get(`${WORKER}/api/inquiries`, {
      headers: { 'x-demo-session': otherSession || '' },
    })).json()
    expect(otherInq.length).toBe(0)
    const otherSandbox = await (await other.request.get(`${WORKER}/api/sandbox`, {
      headers: { 'x-demo-session': otherSession || '' },
    })).json()
    expect(otherSandbox.length).toBe(0)
    await shoot(other, '07-isolated-visitor', project)
    await otherCtx.close()

    dumpDiagnostics(`${project}-network`, probe)
    expect(probe.failedRequests, probe.failedRequests.join(' | ')).toEqual([])
    expect(probe.consoleErrors, probe.consoleErrors.join(' | ')).toEqual([])
  })
})
