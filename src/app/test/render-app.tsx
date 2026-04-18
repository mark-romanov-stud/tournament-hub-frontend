import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'

import { App } from '@/app/App'
import { createAppStore } from '@/app/providers/store'
import { createTestRouter } from '@/app/router/router'

export function renderApp(initialEntries: string[] = ['/']) {
  const store = createAppStore()
  const router = createTestRouter(initialEntries)
  const user = userEvent.setup()

  return {
    user,
    store,
    router,
    ...render(
      <Provider store={store}>
        <App router={router} />
      </Provider>,
    ),
  }
}
