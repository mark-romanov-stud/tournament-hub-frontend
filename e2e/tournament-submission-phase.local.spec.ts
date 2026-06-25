import {
  expect,
  type Browser,
  type Page,
  request,
  type TestInfo,
  test,
} from '@playwright/test'

const backendOrigin = process.env.E2E_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001'
const apiBaseUrl = `${backendOrigin}/api/v1`
const password = 'Password123!'

interface TestUser {
  accessToken: string
  email: string
  refreshToken: string
  username: string
}

interface PreparedTournament {
  owner: TestUser
  participant: TestUser
  prompt: string
  tournamentId: string
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

async function expectPhasePanelSnapshot(page: Page, name: string) {
  await page.locator('[data-e2e-stage-marker]').evaluateAll((elements) => {
    for (const element of elements) {
      element.remove()
    }
  })

  const snapshotStyle = await page.addStyleTag({
    content: `
      .live-tournament-recovery { display: none; }
      .tournament-prompt { min-height: 96px; }
    `,
  })

  try {
    await expect(page.locator('.tournament-phase-panel')).toHaveScreenshot(
      `${name}.png`,
      {
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      },
    )
  } finally {
    await snapshotStyle.evaluate((element) => {
      element.remove()
    })
  }
}

async function registerUser(runId: string, index: number): Promise<TestUser> {
  const api = await request.newContext()
  const email = `submission-${runId}-${index}@tournamenthub.test`
  const username = `s${runId}${index}`.slice(0, 14)
  const response = await api.post(`${apiBaseUrl}/auth/register`, {
    data: { email, password, username },
  })
  const body = (await response.json()) as {
    data: { accessToken: string; refreshToken: string }
  }

  expect(response.ok(), await response.text()).toBe(true)
  await api.dispose()

  return {
    accessToken: body.data.accessToken,
    email,
    refreshToken: body.data.refreshToken,
    username,
  }
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

async function prepareActiveTournament(): Promise<PreparedTournament> {
  const runId = Math.random().toString(36).slice(2, 10)
  const users = await Promise.all(
    Array.from({ length: 4 }, (_, index) => registerUser(runId, index + 1)),
  )
  const [owner, participant] = users

  const tournament = await authorizedPost<{ id: string }>(
    '/tournaments',
    owner.accessToken,
    {
      description: 'Local Playwright submission phase UI check.',
      roundsCount: 3,
      submissionDurationSeconds: 45,
      title: `Submission Phase ${runId}`,
      visibility: 'PUBLIC',
      voteDurationSeconds: 30,
    },
  )

  await Promise.all(
    users
      .slice(1)
      .map((user) =>
        authorizedPost<boolean>(
          `/tournaments/${tournament.id}/join`,
          user.accessToken,
          {},
        ),
      ),
  )

  await authorizedPost<boolean>(
    `/tournaments/${tournament.id}/start`,
    owner.accessToken,
    {},
  )

  const fullTournament = await authorizedGet<{
    currentRound: {
      prompt: { content: string | { en: string } }
    } | null
  }>(`/tournaments/${tournament.id}/full`, owner.accessToken)

  const promptContent = fullTournament.currentRound?.prompt.content

  return {
    owner,
    participant,
    prompt: typeof promptContent === 'string' ? promptContent : (promptContent?.en ?? ''),
    tournamentId: tournament.id,
  }
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

test.describe('local backend submission phase UI', () => {
  test.beforeAll(async () => {
    const api = await request.newContext()
    const response = await api.get(`${backendOrigin}/health`)

    expect(
      response.ok(),
      `Local backend must be running at ${backendOrigin}. Start tournament-hub-backend before running npm run test:e2e:local.`,
    ).toBe(true)

    await api.dispose()
  })

  test('shows prompt, timer, hidden submissions, realtime progress, and voting transition', async ({
    browser,
  }, testInfo) => {
    const { owner, participant, prompt, tournamentId } = await prepareActiveTournament()
    const ownerSession = await createAuthenticatedPage(browser, owner, tournamentId)
    const participantSession = await createAuthenticatedPage(
      browser,
      participant,
      tournamentId,
    )
    const ownerPage = ownerSession.page
    const participantPage = participantSession.page
    const participantSubmission = 'Participant answer must remain hidden.'

    await expect(
      ownerPage.getByRole('heading', { name: /round 1 submission/i }),
    ).toBeVisible()
    await expect(ownerPage.getByText(prompt)).toBeVisible()
    await expect(ownerPage.getByTestId('submission-countdown')).toContainText(
      /seconds remaining/i,
    )
    await expect(ownerPage.getByTestId('submission-progress')).toContainText(
      /0 of \d+ submitted/u,
    )
    await attachScreenshot(ownerPage, testInfo, '01-owner-submission-phase')
    await expectPhasePanelSnapshot(ownerPage, '01-owner-submission-phase-panel', [
      ownerPage.getByTestId('submission-countdown'),
    ])

    await expect(
      participantPage.getByRole('heading', { name: /round 1 submission/i }),
    ).toBeVisible()
    await participantPage.getByLabel(/continue the phrase/i).fill(participantSubmission)
    await attachScreenshot(participantPage, testInfo, '02-participant-ready-to-submit')
    await expectPhasePanelSnapshot(
      participantPage,
      '02-participant-ready-to-submit-panel',
      [
        participantPage.getByTestId('submission-countdown'),
        participantPage.getByLabel(/continue the phrase/i),
      ],
    )
    await participantPage.getByRole('button', { name: /submit response/i }).click()
    await expect(participantPage.getByText(/submission saved/i)).toBeVisible()

    await expect(ownerPage.getByTestId('submission-progress')).toContainText(
      /1 of 2 submitted/u,
    )
    await expect(
      ownerPage.getByText(/submissions are hidden until voting starts/i),
    ).toBeVisible()
    await expect(ownerPage.getByText(participantSubmission)).toHaveCount(0)
    await attachScreenshot(ownerPage, testInfo, '03-owner-progress-hidden-content')
    await expectPhasePanelSnapshot(ownerPage, '03-owner-progress-hidden-content-panel', [
      ownerPage.getByTestId('submission-countdown'),
    ])

    await ownerPage
      .getByLabel(/continue the phrase/i)
      .fill('Owner answer that completes the active submission set.')
    await attachScreenshot(ownerPage, testInfo, '04-owner-ready-to-submit')
    await expectPhasePanelSnapshot(ownerPage, '04-owner-ready-to-submit-panel', [
      ownerPage.getByTestId('submission-countdown'),
      ownerPage.getByLabel(/continue the phrase/i),
    ])
    await ownerPage.getByRole('button', { name: /submit response/i }).click()

    await expect(
      ownerPage.getByRole('heading', { name: /round 1 voting/i }),
    ).toBeVisible()
    await expect(ownerPage.getByRole('button', { name: /submit response/i })).toHaveCount(
      0,
    )
    await expect(ownerPage.getByTestId('revealed-submission')).toContainText(
      participantSubmission,
    )
    await expect(ownerPage.getByText('Submission 1 of 2')).toBeVisible()
    await expect(ownerPage.getByTestId('voting-countdown')).toContainText(
      /seconds remaining/i,
    )
    await expect(ownerPage.getByTestId('vote-progress')).toContainText(
      /waiting for active voter responses/i,
    )
    await attachScreenshot(ownerPage, testInfo, '05-owner-voting-after-transition')
    await expectPhasePanelSnapshot(ownerPage, '05-owner-voting-after-transition-panel', [
      ownerPage.getByTestId('voting-countdown'),
    ])

    await expect(participantPage.getByTestId('revealed-submission')).toContainText(
      participantSubmission,
    )
    await expect(participantPage.getByText(/self-voting is disabled/i)).toBeVisible()
    await expect(participantPage.getByRole('button', { name: /^like$/i })).toBeDisabled()
    await expect(
      participantPage.getByRole('button', { name: /^dislike$/i }),
    ).toBeDisabled()
    await attachScreenshot(participantPage, testInfo, '06-author-self-vote-blocked')
    await expectPhasePanelSnapshot(participantPage, '06-author-self-vote-blocked-panel', [
      participantPage.getByTestId('voting-countdown'),
    ])

    await ownerPage.getByRole('button', { name: /^like$/i }).click()

    await expect(participantPage.getByTestId('revealed-submission')).toContainText(
      'Owner answer that completes the active submission set.',
    )
    await expect(participantPage.getByText('Submission 2 of 2')).toBeVisible()
    await expect(participantPage.getByRole('button', { name: /^like$/i })).toBeEnabled()
    await expect(
      participantPage.getByRole('button', { name: /^dislike$/i }),
    ).toBeEnabled()
    await expect(ownerPage.getByText(/self-voting is disabled/i)).toBeVisible()
    await attachScreenshot(participantPage, testInfo, '07-next-submission-revealed')
    await expectPhasePanelSnapshot(participantPage, '07-next-submission-revealed-panel', [
      participantPage.getByTestId('voting-countdown'),
    ])

    await participantPage.getByRole('button', { name: /^dislike$/i }).click()

    await expect(
      participantPage.getByRole('heading', { name: /round 1 voting finished/i }),
    ).toBeVisible()
    await attachScreenshot(participantPage, testInfo, '08-sequential-voting-finished')
    await expectPhasePanelSnapshot(participantPage, '08-sequential-voting-finished-panel')

    await expect(
      participantPage.getByRole('heading', { name: /round 1 results/i }),
    ).toBeVisible()
    await expect(participantPage.getByTestId('live-leaderboard')).toBeVisible()
    await expect(
      participantPage.getByRole('heading', { name: /round 2 submission/i }),
    ).toBeVisible()
    const nextRoundPrompt = participantPage.getByTestId('active-round-prompt')

    await expect(nextRoundPrompt).not.toContainText(prompt)
    await expect(nextRoundPrompt).toContainText(/phrase to continue/i)
    await expect(participantPage.getByTestId('round-submission-form')).toHaveAttribute(
      'data-round-id',
      /.+/,
    )
    await expect(participantPage.getByLabel(/continue the phrase/i)).toHaveValue('')
    await attachScreenshot(
      participantPage,
      testInfo,
      '09-round-results-leaderboard-and-next-round',
    )
    const resultsSnapshotStyle = await participantPage.addStyleTag({
      content: `
        .live-tournament-recovery { display: none; }
        .live-results-panel { height: 860px; overflow: hidden; }
        .result-identity { height: 112px; overflow: hidden; }
      `,
    })

    try {
      await expect(participantPage.locator('.live-results-panel')).toHaveScreenshot(
        '09-round-results-and-leaderboard-panel.png',
        {
          animations: 'disabled',
        },
      )
    } finally {
      await resultsSnapshotStyle.evaluate((element) => {
        element.remove()
      })
    }

    await participantPage
      .getByLabel(/continue the phrase/i)
      .fill('A fresh continuation for the new active prompt.')
    await attachScreenshot(
      participantPage,
      testInfo,
      '10-next-round-prompt-and-fresh-submission',
    )
    await expectPhasePanelSnapshot(
      participantPage,
      '10-next-round-prompt-and-fresh-submission-panel',
      [
        participantPage.getByTestId('submission-countdown'),
        participantPage.getByLabel(/continue the phrase/i),
      ],
    )

    await participantSession.context.close()
    await ownerSession.context.close()
  })
})
