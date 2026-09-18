import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen.ts'
import './styles/app.css'

// The window loads the built renderer from `file://`, where a path-based history has no route
// to match on first paint. Hash history keeps every screen addressable — which is what the
// E2E suite drives — without pretending a file URL is a server.
const router = createRouter({ routeTree, history: createHashHistory(), defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const container = document.getElementById('root')
if (container === null) throw new Error('index.html is missing #root')

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
