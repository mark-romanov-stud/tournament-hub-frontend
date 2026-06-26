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
  refreshToken: string
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)

  await page.screenshot({ fullPage: true, path })
  await testInfo.attach(name, {
    path,
    contentType: 'image/png',
  })
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

async function registerUser(runId: string, index: number): Promise<TestUser> {
  const api = await request.newContext()
  const response = await api.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `recovery-${runId}-${index}@tournamenthub.test`,
      password,
      username: `r${runId}${index}`.slice(0, 14),
    },
  })
  const body = (await response.json()) as {
    data: { accessToken: string; refreshToken: string }
  }

  expect(response.ok(), await response.text()).toBe(true)
  await api.dispose()

  return body.data
}

async function createTournament(owner: TestUser, title: string) {
  return authorizedPost<{ id: string }>('/tournaments', owner.accessToken, {
    description: 'Live tournament app-entry recovery E2E.',
    roundsCount: 3,
    submissionDurationSeconds: 45,
    title,
    visibility: 'PUBLIC',
    voteDurationSeconds: 30,
  })
}

async function createAuthenticatedPage(browser: Browser, user: TestUser) {
  const context = await browser.newContext()

  await context.addInitScript(({ accessToken, refreshToken }) => {
    window.sessionStorage.setItem('tournament-hub.auth.access-token', accessToken)
    window.sessionStorage.setItem('tournament-hub.auth.refresh-token', refreshToken)
  }, user)

  const page = await context.newPage()

  return { context, page }
}

test.describe('active live tournament app recovery', () => {
  test.beforeAll(async () => {
    const api = await request.newContext()
    const response = await api.get(`${backendOrigin}/health`)

    expect(
      response.ok(),
      `Local backend must be running at ${backendOrigin}. Start tournament-hub-backend before running npm run test:e2e:local.`,
    ).toBe(true)

    await api.dispose()
  })

  test('recovers an active match from app entry and blocks conflicting flows', async ({
    browser,
  }, testInfo) => {
    const runId = Math.random().toString(36).slice(2, 10)
    const users = await Promise.all(
      Array.from({ length: 5 }, (_, index) => registerUser(runId, index + 1)),
    )
    const [owner, activeParticipant, fillerOne, fillerTwo, draftOwner] = users
    const activeTitle = `Recovery Match ${runId}`
    const activeTournament = await createTournament(owner, activeTitle)

    await Promise.all(
      [activeParticipant, fillerOne, fillerTwo].map((user) =>
        authorizedPost<boolean>(
          `/tournaments/${activeTournament.id}/join`,
          user.accessToken,
          {},
        ),
      ),
    )
    await authorizedPost<boolean>(
      `/tournaments/${activeTournament.id}/start`,
      owner.accessToken,
      {},
    )

    const conflictingDraft = await createTournament(
      draftOwner,
      `Conflicting Draft ${runId}`,
    )
    const session = await createAuthenticatedPage(browser, activeParticipant)
    const page = session.page

    await page.goto('/')

    const recoveryBanner = page.getByTestId('live-tournament-recovery')

    await expect(recoveryBanner).toContainText(activeTitle)
    await expect(recoveryBanner).toContainText(/round 1/i)
    await expect(
      page.getByRole('button', { name: /return to live match/i }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /finish live match first/i }),
    ).toBeDisabled()
    await attachScreenshot(page, testInfo, '01-dashboard-live-match-recovery')
    await expect(recoveryBanner).toHaveScreenshot('01-live-match-recovery-banner.png', {
      animations: 'disabled',
    })

    await page.goto('/tournaments/create')
    await expect(page.getByText(/finish your active tournament/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /create tournament/i })).toBeDisabled()
    await attachScreenshot(page, testInfo, '02-create-tournament-blocked')

    await page.goto(`/tournaments/${conflictingDraft.id}`)
    await expect(page.getByText(/already active in another tournament/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /join tournament/i })).toBeDisabled()
    await attachScreenshot(page, testInfo, '03-conflicting-join-blocked')

    await Promise.all([
      page.waitForURL(`/tournaments/${activeTournament.id}`),
      page.getByRole('button', { name: /return to live match/i }).click(),
    ])
    await expect(page.getByRole('heading', { name: activeTitle })).toBeVisible()
    await expect(recoveryBanner).toHaveCount(0)

    await session.context.close()
  })
})
