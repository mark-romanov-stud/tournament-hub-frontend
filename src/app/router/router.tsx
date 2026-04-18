import { createBrowserRouter, createMemoryRouter } from 'react-router-dom'

import { GuestRoute, ProtectedRoute } from '@/features/auth/ui/route-guards'
import { LoginPage } from '@/pages/auth/login-page'
import { RegisterPage } from '@/pages/auth/register-page'
import { HomePage } from '@/pages/home/home-page'

const routes = [
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <HomePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/login',
    element: (
      <GuestRoute>
        <LoginPage />
      </GuestRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <GuestRoute>
        <RegisterPage />
      </GuestRoute>
    ),
  },
]

export const router = createBrowserRouter(routes)

export function createTestRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(routes, {
    initialEntries,
  })
}
