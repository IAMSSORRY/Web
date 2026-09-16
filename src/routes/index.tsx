import { createBrowserRouter } from 'react-router'
import RootLayout from '../layouts/RootLayout'
import Dashboard from '../pages/Dashboard'
import Landing from '../pages/Landing'
import NotFound from '../pages/NotFound'
import { paths } from './paths'

export const router = createBrowserRouter([
  {
    path: paths.landing,
    Component: RootLayout,
    children: [
      { index: true, Component: Landing },
      { path: paths.dashboard.slice(1), Component: Dashboard },
      { path: '*', Component: NotFound },
    ],
  },
])
