import {
  expect,
  type Browser,
  type Locator,
  type Page,
  request,
  test,
  type TestInfo,
} from '@playwright/test'

const backendOrigin = process.env.E2E_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001'
const apiBaseUrl = `${backendOrigin}/api/v1`
const password = 'Password123!'

interface TestUser {
  accessToken: string
  email: string
  id: string
  refreshToken: string
  username: string
}

interface CreatedTournament {
  id: string
  inviteToken?: string
}

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

async function expectTournamentCardSnapshot(
  page: Page,
  name: string,
  mask: Locator[] = [],
) {
  const card = page.locator('.tournament-main-card')

  await expect(card).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    mask: [
      card.locator('.tournament-id-block p'),
      card.locator('.participant-row strong'),
      ...mask,
    ],
    maskColor: '#fde68a',
  })
}

async function authorizedGet<T>(path: string, accessToken: string): Promise<T> {
  const api = await request.newContext()
  const response = await api.get(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = (await response.json()) as { data: T }

  expect(response.ok(), await response.text()).toBe(true)
  await api.dispose()

  return body.data
}

async function authorizedPost<T>(
  path: string,
  accessToken: string,
  data: object,
): Promise<T> {
  const api = await request.newContext()
  const response = await api.post(`${apiBaseUrl}${path}`, {
    data,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = (await response.json()) as { data: T }

  expect(response.ok(), await response.text()).toBe(true)
  await api.dispose()

  return body.data
}

async function registerUser(runId: string, label: string): Promise<TestUser> {
  const api = await request.newContext()
  const uniqueSuffix = `${Date.now().toString(36).slice(-5)}${Math.random()
    .toString(36)
    .slice(2, 6)}`
  const email = `cancel-${runId}-${label}-${uniqueSuffix}@tournamenthub.test`
  const username = `c${label.slice(0, 3)}${uniqueSuffix}`
    .replace(/[^a-z0-9]/giu, '')
    .slice(0, 15)
  const response = await api.post(`${apiBaseUrl}/auth/register`, {
    data: { email, password, username },
  })
  const body = (await response.json()) as {
    data: { accessToken: string; refreshToken: string }
  }

  expect(response.ok(), await response.text()).toBe(true)
  await api.dispose()

  const profile = await authorizedGet<{ id: string }>(
    '/users/profile',
    body.data.accessToken,
  )

  return {
    accessToken: body.data.accessToken,
    email,
    id: profile.id,
    refreshToken: body.data.refreshToken,
    username,
  }
}

async function createDraftTournament(
  owner: TestUser,
  runId: string,
): Promise<CreatedTournament> {
  return authorizedPost<CreatedTournament>('/tournaments', owner.accessToken, {
    description: 'Playwright tournament cancellation flow.',
    roundsCount: 3,
    submissionDurationSeconds: 45,
    title: `Cancel Flow ${runId}`,
    visibility: 'PUBLIC',
    voteDurationSeconds: 30,
  })
}

async function createAuthenticatedPage(
  browser: Browser,
  user: TestUser,
  tournamentId: string,
) {
  const context = await browser.newContext()

  await context.addInitScript(
    ({ accessToken, refreshToken }) => {
      window.sessionStorage.setItem('tournament-hub.auth.access-token', accessToken)
      window.sessionStorage.setItem('tournament-hub.auth.refresh-token', refreshToken)
    },
    {
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
    },
  )

  const page = await context.newPage()
  await page.goto(`/tournaments/${tournamentId}`)

  return { context, page }
}

test.describe('local backend tournament cancellation flow', () => {
  test.beforeAll(async () => {
    const api = await request.newContext()
    const response = await api.get(`${backendOrigin}/health`)

    expect(
      response.ok(),
      `Local backend must be running at ${backendOrigin}. Start tournament-hub-backend before running npm run test:e2e:local.`,
    ).toBe(true)

    await api.dispose()
  })

  test('owner cancels a draft tournament, removes participants, and notifies connected clients in realtime', async ({
    browser,
  }, testInfo) => {
    const runId = Math.random().toString(36).slice(2, 10)
    const [owner, participant] = await Promise.all([
      registerUser(runId, 'cancelowner'),
      registerUser(runId, 'cancelparticipant'),
    ])
    const tournament = await createDraftTournament(owner, runId)

    await authorizedPost<boolean>(
      `/tournaments/${tournament.id}/join`,
      participant.accessToken,
      {},
    )

    const ownerSession = await createAuthenticatedPage(browser, owner, tournament.id)
    const participantSession = await createAuthenticatedPage(
      browser,
      participant,
      tournament.id,
    )
    const ownerPage = ownerSession.page
    const participantPage = participantSession.page

    await expect(
      ownerPage.getByRole('heading', { name: `Cancel Flow ${runId}` }),
    ).toBeVisible()
    await expect(
      ownerPage.getByRole('button', { name: /cancel tournament/i }),
    ).toBeVisible()
    await expect(
      participantPage.getByRole('button', { name: /cancel tournament/i }),
    ).toHaveCount(0)
    await attachScreenshot(ownerPage, testInfo, '01-owner-draft-lobby-before-cancel')
    await expectTournamentCardSnapshot(ownerPage, '01-owner-draft-lobby-before-cancel')

    ownerPage.once('dialog', (dialog) => {
      void dialog.accept()
    })

    const cancelResponse = ownerPage.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/tournaments/${tournament.id}/cancel`) &&
        response.request().method() === 'POST',
    )

    await ownerPage.getByRole('button', { name: /cancel tournament/i }).click()
    await expect((await cancelResponse).ok()).toBe(true)

    await expect(
      ownerPage.getByRole('heading', { name: /curator dashboard/i }),
    ).toBeVisible()
    await attachScreenshot(ownerPage, testInfo, '02-owner-dashboard-after-cancel')

    await expect(
      participantPage.getByRole('heading', { name: /tournament cancelled/i }),
    ).toBeVisible()
    await expect(participantPage.getByTestId('tournament-cancelled-panel')).toContainText(
      'all participants were removed',
    )
    await expect(
      participantPage.getByRole('button', { name: /leave tournament/i }),
    ).toHaveCount(0)
    await attachScreenshot(
      participantPage,
      testInfo,
      '03-participant-tournament-cancelled',
    )
    await expectTournamentCardSnapshot(
      participantPage,
      '03-participant-tournament-cancelled',
    )

    await participantSession.context.close()
    await ownerSession.context.close()
  })

  test('displays cancel API errors to the owner without leaving the page', async ({
    browser,
  }, testInfo) => {
    const runId = Math.random().toString(36).slice(2, 10)
    const owner = await registerUser(runId, 'cancelerror')
    const tournament = await createDraftTournament(owner, runId)
    const ownerSession = await createAuthenticatedPage(browser, owner, tournament.id)
    const ownerPage = ownerSession.page
    const errorMessage = 'Synthetic cancel failure from Playwright'

    await ownerPage.route(`**/api/v1/tournaments/${tournament.id}/cancel`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        status: 400,
        body: JSON.stringify({
          code: 400,
          data: null,
          error: 'Bad Request',
          message: [errorMessage],
        }),
      }),
    )

    await expect(
      ownerPage.getByRole('button', { name: /cancel tournament/i }),
    ).toBeVisible()
    ownerPage.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await ownerPage.getByRole('button', { name: /cancel tournament/i }).click()

    await expect(ownerPage.getByText(errorMessage)).toBeVisible()
    await expect(
      ownerPage.getByRole('heading', { name: `Cancel Flow ${runId}` }),
    ).toBeVisible()
    await expect(
      ownerPage.getByRole('button', { name: /cancel tournament/i }),
    ).toBeVisible()
    await attachScreenshot(ownerPage, testInfo, '04-cancel-error-visible')
    await expectTournamentCardSnapshot(ownerPage, '04-cancel-error-visible')

    await ownerSession.context.close()
  })

  test('does not cancel when the confirmation dialog is dismissed', async ({
    browser,
  }) => {
    const runId = Math.random().toString(36).slice(2, 10)
    const owner = await registerUser(runId, 'cancelkeep')
    const tournament = await createDraftTournament(owner, runId)
    const ownerSession = await createAuthenticatedPage(browser, owner, tournament.id)
    const ownerPage = ownerSession.page

    await expect(
      ownerPage.getByRole('button', { name: /cancel tournament/i }),
    ).toBeVisible()

    ownerPage.once('dialog', (dialog) => {
      void dialog.dismiss()
    })

    await ownerPage.getByRole('button', { name: /cancel tournament/i }).click()
    await expect(
      ownerPage.getByRole('heading', { name: `Cancel Flow ${runId}` }),
    ).toBeVisible()

    const tournamentStillDraft = await authorizedGet<{ status: string }>(
      `/tournaments/${tournament.id}`,
      owner.accessToken,
    )
    expect(tournamentStillDraft.status).toBe('DRAFT')

    await ownerSession.context.close()
  })
})
