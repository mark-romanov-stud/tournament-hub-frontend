import {
  expect,
  type Browser,
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

async function expectTournamentCardSnapshot(page: Page, name: string) {
  const card = page.locator('.create-tournament-card')
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu

  await expect(card).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    mask: [
      card.locator('h2'),
      card.locator('p').filter({ hasText: uuidPattern }),
      card.getByText(/^Active users:/u),
      card.getByTestId('tournament-latest-event'),
    ],
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
  const email = `draft-${runId}-${label}@pulse.test`
  const username = `d${label}${runId}${Math.random().toString(36).slice(2, 4)}`
    .replace(/[^a-z0-9]/giu, '')
    .slice(0, 14)
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
    description: 'Playwright draft lobby join and realtime flow.',
    roundsCount: 3,
    submissionDurationSeconds: 45,
    title: `Draft Lobby ${runId}`,
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

function countTournamentStateRequests(page: Page, tournamentId: string) {
  let count = 0

  page.on('request', (requestInfo) => {
    const url = requestInfo.url()

    if (
      requestInfo.method() === 'GET' &&
      (url.endsWith(`/api/v1/tournaments/${tournamentId}`) ||
        url.endsWith(`/api/v1/tournaments/${tournamentId}/full`))
    ) {
      count += 1
    }
  })

  return () => count
}

test.describe('local backend draft lobby join flow', () => {
  test.beforeAll(async () => {
    const api = await request.newContext()
    const response = await api.get(`${backendOrigin}/health`)

    expect(
      response.ok(),
      `Local backend must be running at ${backendOrigin}. Start tournament-hub-backend before running npm run test:e2e:local.`,
    ).toBe(true)

    await api.dispose()
  })

  test('joins a draft tournament, updates participant state, and reflects join/leave realtime events without owner polling', async ({
    browser,
  }, testInfo) => {
    const runId = Math.random().toString(36).slice(2, 10)
    const [owner, participant, spectator, fillerOne, fillerTwo] = await Promise.all([
      registerUser(runId, 'owner'),
      registerUser(runId, 'participant'),
      registerUser(runId, 'spectator'),
      registerUser(runId, 'fillera'),
      registerUser(runId, 'fillerb'),
    ])
    const tournament = await createDraftTournament(owner, runId)
    const ownerSession = await createAuthenticatedPage(browser, owner, tournament.id)
    const participantSession = await createAuthenticatedPage(
      browser,
      participant,
      tournament.id,
    )
    const ownerPage = ownerSession.page
    const participantPage = participantSession.page

    await expect(
      ownerPage.getByRole('heading', { name: `Draft Lobby ${runId}` }),
    ).toBeVisible()
    await expect(ownerPage.getByRole('button', { name: /join tournament/i })).toHaveCount(
      0,
    )
    await expect(ownerPage.getByText('Participant count: 1')).toBeVisible()
    await expect(
      ownerPage.getByRole('button', { name: /start tournament/i }),
    ).toBeDisabled()
    await expect(ownerPage.getByText(/1 of 4 participants joined/i)).toBeVisible()
    await expect(ownerPage.getByTestId('tournament-realtime-status')).toContainText(
      'Connected',
    )

    await expect(
      participantPage.getByRole('heading', { name: `Draft Lobby ${runId}` }),
    ).toBeVisible()
    await expect(
      participantPage.getByRole('button', { name: /join tournament/i }),
    ).toBeVisible()
    await attachScreenshot(ownerPage, testInfo, '01-owner-draft-lobby-before-join')
    await expectTournamentCardSnapshot(ownerPage, '01-owner-draft-lobby-before-join')
    await attachScreenshot(
      participantPage,
      testInfo,
      '02-participant-draft-lobby-before-join',
    )
    await expectTournamentCardSnapshot(
      participantPage,
      '02-participant-draft-lobby-before-join',
    )

    const getOwnerStateRequestCount = countTournamentStateRequests(
      ownerPage,
      tournament.id,
    )
    let joinRequestSent = false

    await participantPage.route(
      `**/api/v1/tournaments/${tournament.id}/join`,
      async (route) => {
        joinRequestSent = true
        await new Promise((resolve) => {
          setTimeout(resolve, 1500)
        })
        await route.continue()
      },
    )

    const joinResponse = participantPage.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/tournaments/${tournament.id}/join`) &&
        response.request().method() === 'POST',
    )

    await participantPage.getByRole('button', { name: /join tournament/i }).click()
    await expect(participantPage.getByRole('button', { name: /joining/i })).toBeVisible()
    await attachScreenshot(participantPage, testInfo, '03-participant-joining-loading')
    await expectTournamentCardSnapshot(participantPage, '03-participant-joining-loading')
    await expect((await joinResponse).ok()).toBe(true)
    expect(joinRequestSent).toBe(true)

    await expect(
      participantPage.getByRole('button', { name: /join tournament/i }),
    ).toHaveCount(0)
    await expect(participantPage.getByText(participant.id)).toBeVisible()
    await expect(participantPage.getByText('Participant count: 2')).toBeVisible()
    await attachScreenshot(participantPage, testInfo, '04-participant-after-join')
    await expectTournamentCardSnapshot(participantPage, '04-participant-after-join')

    await expect(ownerPage.getByText(participant.id)).toBeVisible()
    await expect(ownerPage.getByText('Participant count: 2')).toBeVisible()
    await attachScreenshot(ownerPage, testInfo, '05-owner-realtime-after-join')
    await expectTournamentCardSnapshot(ownerPage, '05-owner-realtime-after-join')

    await expect
      .poll(getOwnerStateRequestCount, {
        message: 'owner lobby should update from WebSocket events without REST polling',
      })
      .toBe(0)

    await participantPage.getByRole('button', { name: /leave tournament/i }).click()

    await expect(ownerPage.getByText(participant.id)).toHaveCount(0)
    await expect(ownerPage.getByText('Participant count: 1')).toBeVisible()
    await attachScreenshot(ownerPage, testInfo, '06-owner-realtime-after-leave')
    await expectTournamentCardSnapshot(ownerPage, '06-owner-realtime-after-leave')
    await expect
      .poll(getOwnerStateRequestCount, {
        message: 'owner lobby should also process leave events without polling',
      })
      .toBe(0)
    await expect(
      participantPage.getByRole('button', { name: /join tournament/i }),
    ).toBeVisible()

    await authorizedPost<boolean>(
      `/tournaments/${tournament.id}/join`,
      participant.accessToken,
      {},
    )
    await Promise.all([
      authorizedPost<boolean>(
        `/tournaments/${tournament.id}/join`,
        fillerOne.accessToken,
        {},
      ),
      authorizedPost<boolean>(
        `/tournaments/${tournament.id}/join`,
        fillerTwo.accessToken,
        {},
      ),
    ])
    await expect(ownerPage.getByText('Participant count: 4')).toBeVisible()
    await expect(ownerPage.getByText(/all required players are here/i)).toBeVisible()
    await expect(
      ownerPage.getByRole('button', { name: /start tournament/i }),
    ).toBeEnabled()
    await attachScreenshot(ownerPage, testInfo, '07-owner-ready-to-start')
    await expectTournamentCardSnapshot(ownerPage, '07-owner-ready-to-start')

    await ownerPage.getByRole('button', { name: /start tournament/i }).click()

    await expect(
      ownerPage.getByRole('heading', { name: /round 1 submission/i }),
    ).toBeVisible()
    await expect(ownerPage.getByTestId('active-round-prompt')).toBeVisible()
    await expect(
      ownerPage.getByRole('button', { name: /start tournament/i }),
    ).toHaveCount(0)
    await attachScreenshot(ownerPage, testInfo, '08-owner-started-round-one-submission')

    const spectatorSession = await createAuthenticatedPage(
      browser,
      spectator,
      tournament.id,
    )

    await expect(spectatorSession.page.getByText(/tournament not found/i)).toBeVisible()
    await expect(
      spectatorSession.page.getByRole('button', { name: /join tournament/i }),
    ).toHaveCount(0)
    await attachScreenshot(
      spectatorSession.page,
      testInfo,
      '07-spectator-active-tournament-no-join',
    )
    await expect(spectatorSession.page).toHaveScreenshot(
      '07-spectator-active-tournament-no-join.png',
      {
        animations: 'disabled',
        fullPage: true,
      },
    )

    await spectatorSession.context.close()
    await participantSession.context.close()
    await ownerSession.context.close()
  })

  test('displays join API errors to the user', async ({ browser }, testInfo) => {
    const runId = Math.random().toString(36).slice(2, 10)
    const [owner, participant] = await Promise.all([
      registerUser(runId, 'errorowner'),
      registerUser(runId, 'errorjoiner'),
    ])
    const tournament = await createDraftTournament(owner, `Error ${runId}`)
    const participantSession = await createAuthenticatedPage(
      browser,
      participant,
      tournament.id,
    )
    const participantPage = participantSession.page
    const errorMessage = 'Synthetic join failure from Playwright'

    await participantPage.route(`**/api/v1/tournaments/${tournament.id}/join`, (route) =>
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
      participantPage.getByRole('button', { name: /join tournament/i }),
    ).toBeVisible()
    await attachScreenshot(participantPage, testInfo, '08-join-error-before-submit')
    await expectTournamentCardSnapshot(participantPage, '08-join-error-before-submit')
    await participantPage.getByRole('button', { name: /join tournament/i }).click()

    await expect(participantPage.getByText(errorMessage)).toBeVisible()
    await expect(
      participantPage.getByRole('button', { name: /join tournament/i }),
    ).toBeVisible()
    await expect(participantPage.getByText('Participant count: 1')).toBeVisible()
    await attachScreenshot(participantPage, testInfo, '09-join-error-visible')
    await expectTournamentCardSnapshot(participantPage, '09-join-error-visible')

    await participantSession.context.close()
  })
})
