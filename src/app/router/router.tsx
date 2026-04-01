import { createBrowserRouter } from 'react-router-dom'

import { HomePage } from '@/pages/home/home-page'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
])
