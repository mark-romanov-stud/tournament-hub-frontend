import {
  expect,
  type Locator,
  type Page,
  request,
  type TestInfo,
  test,
} from '@playwright/test'

const backendOrigin = process.env.E2E_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001'

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.locator('[data-e2e-stage-marker]').evaluateAll((elements) => {
    for (const element of elements) {
      element.remove()
    }
  })
  await page.evaluate((label) => {
    const marker = document.createElement('div')
    marker.dataset.e2eStageMarker = 'true'
    marker.textContent = label
    marker.style.position = 'fixed'
    marker.style.top = '12px'
    marker.style.left = '12px'
    marker.style.zIndex = '2147483647'
    marker.style.padding = '8px 12px'
    marker.style.borderRadius = '10px'
    marker.style.color = '#fff'
    marker.style.background = 'rgb(17 24 39 / 92%)'
    marker.style.font = '700 13px system-ui'
    marker.style.boxShadow = '0 10px 30px rgb(0 0 0 / 20%)'
    document.body.append(marker)
  }, name)

  const path = testInfo.outputPath(`${name}.png`)

  await page.screenshot({ fullPage: true, path })
  await testInfo.attach(name, {
    path,
    contentType: 'image/png',
  })

  await page.locator('[data-e2e-stage-marker]').evaluateAll((elements) => {
    for (const element of elements) {
      element.remove()
    }
  })
}

async function expectVisualSnapshot(page: Page, name: string, mask: Locator[] = []) {
  await page.locator('[data-e2e-stage-marker]').evaluateAll((elements) => {
    for (const element of elements) {
      element.remove()
    }
  })

  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    fullPage: true,
    mask,
  })
}

test.describe('local backend tournament realtime flow', () => {
  test.beforeAll(async () => {
    const api = await request.newContext()
    const response = await api.get(`${backendOrigin}/health`)

    expect(
      response.ok(),
      `Local backend must be running at ${backendOrigin}. Start tournament-hub-backend before running npm run test:e2e:local.`,
    ).toBe(true)

    await api.dispose()
  })

  test('registers, creates a tournament, joins realtime room, receives events, and recovers after reconnect', async ({
    context,
    page,
  }, testInfo) => {
    const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const email = `e2e-${runId}@pulse.test`
    const username = `e2e${runId}`.slice(0, 14)
    const password = 'Password123!'
    const title = `E2E Realtime ${runId}`

    let fullTournamentRequestCount = 0

    page.on('response', (response) => {
      if (
        response.url().includes('/api/v1/tournaments/') &&
        response.url().endsWith('/full') &&
        response.ok()
      ) {
        fullTournamentRequestCount += 1
      }
    })

    await page.route('**/api/v1/tournaments', (route) => {
      if (route.request().method() !== 'GET') {
        return route.continue()
      }

      return route.fulfill({
        contentType: 'application/json',
        status: 200,
        body: JSON.stringify({
          code: 200,
          data: { items: [], totalCount: 0 },
          error: null,
          message: ['success'],
        }),
      })
    })

    await page.goto('/register')
    await attachScreenshot(page, testInfo, '01-register-page')
    await expectVisualSnapshot(page, '01-register-page')

    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Email Address').fill(email)
    await page.locator('input[name="password"]').fill(password)
    await attachScreenshot(page, testInfo, '02-register-filled')
    await expectVisualSnapshot(page, '02-register-filled', [page.locator('input')])
    await page.getByRole('button', { name: /register account/i }).click()

    await expect(page.getByRole('heading', { name: /curator dashboard/i })).toBeVisible()
    await attachScreenshot(page, testInfo, '03-dashboard-after-registration')
    await expectVisualSnapshot(page, '03-dashboard-after-registration', [
      page.locator('.dashboard-card__meta'),
    ])

    await page.goto('/tournaments/create')
    await expect(
      page.getByRole('heading', { name: /initialize your competition/i }),
    ).toBeVisible()
    await attachScreenshot(page, testInfo, '04-create-tournament-empty')
    await expectVisualSnapshot(page, '04-create-tournament-empty')
    await page.getByLabel('Tournament Name').fill(title)
    await page
      .getByLabel('Description')
      .fill('Playwright local backend realtime smoke test.')
    await page.getByLabel('Number of Rounds').selectOption('3')
    await page.getByLabel('Submission Duration').selectOption('30')
    await page.getByLabel('Vote Duration').selectOption('30')
    await expect(page.getByLabel('Tournament Name')).toHaveValue(title)
    await expect(page.getByLabel('Description')).toHaveValue(
      'Playwright local backend realtime smoke test.',
    )
    await attachScreenshot(page, testInfo, '05-create-tournament-filled')
    await expectVisualSnapshot(page, '05-create-tournament-filled', [
      page.getByLabel('Tournament Name'),
    ])

    await Promise.all([
      page.waitForURL(/\/tournaments\/[0-9a-f-]+$/u),
      page.getByRole('button', { name: /create tournament/i }).click(),
    ])

    await expect(page.getByRole('heading', { name: /tournament created/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    await expect(page.getByTestId('tournament-realtime-status')).toContainText(
      'Connected',
    )
    await expect(page.getByTestId('tournament-latest-event')).toContainText(
      'tournament:presence_updated',
    )
    await expect.poll(() => fullTournamentRequestCount).toBeGreaterThanOrEqual(1)
    await attachScreenshot(page, testInfo, '06-tournament-connected')
    await expect(page.locator('.tournament-realtime-panel')).toHaveScreenshot(
      '06-realtime-connected-panel.png',
      { animations: 'disabled' },
    )

    await context.setOffline(true)
    await expect(page.getByTestId('tournament-realtime-status')).toContainText(
      'Disconnected',
    )
    await attachScreenshot(page, testInfo, '07-tournament-disconnected')
    await expect(page.locator('.tournament-realtime-panel')).toHaveScreenshot(
      '07-realtime-disconnected-panel.png',
      { animations: 'disabled' },
    )

    await context.setOffline(false)
    await expect(page.getByTestId('tournament-realtime-status')).toContainText(
      'Connected',
    )
    await expect.poll(() => fullTournamentRequestCount).toBeGreaterThanOrEqual(2)
    await expect(page.getByTestId('tournament-recovery-note')).toContainText(
      /recovered after reconnect/i,
    )
    await attachScreenshot(page, testInfo, '08-tournament-reconnected')
    await expect(page.locator('.tournament-realtime-panel')).toHaveScreenshot(
      '08-realtime-reconnected-panel.png',
      {
        animations: 'disabled',
        mask: [page.getByTestId('tournament-recovery-note')],
      },
    )
  })
})
