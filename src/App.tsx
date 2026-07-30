import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { AppQueryProvider } from './lib/queryClient'
import { AppRoutes } from './routes'
import { UpdatePrompt } from './components/UpdatePrompt'
import { usePrefsSync } from './features/settings/usePrefsSync'

/** Hosts `usePrefsSync()` inside `AppQueryProvider` (so `useProfile`'s `useQuery` call has a
 *  `QueryClientProvider` in scope) and under `AuthProvider` via context (so `useAuth` resolves) —
 *  a stable sibling of the router, mounted once for the app's entire lifetime. NOT inside
 *  `AuthProvider` directly: that component sits *above* `AppQueryProvider` in this tree, so
 *  `useProfile` there would have no query client. NOT inside `routes.tsx`'s `Protected` either:
 *  `Protected` is re-declared per `<Route>` and remounts on navigation between full-screen routes.
 *  Renders nothing; unexported so this file's only exported binding stays the `App` component
 *  (react-refresh/only-export-components). */
function PrefsSyncMount() {
  usePrefsSync()
  return null
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <UpdatePrompt />
      <AuthProvider>
        <AppQueryProvider>
          <PrefsSyncMount />
          <AppRoutes />
        </AppQueryProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
