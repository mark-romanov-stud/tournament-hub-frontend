import { useState } from 'react'
import { type DataRouter, RouterProvider } from 'react-router-dom'

import { router } from '@/app/router/router'
import { useAuthBootstrap } from '@/features/auth/hooks/use-auth-bootstrap'

export function App({ router: providedRouter }: { router?: DataRouter }) {
  const [routerInstance] = useState(() => providedRouter ?? router)

  useAuthBootstrap()

  return <RouterProvider router={routerInstance} />
}
