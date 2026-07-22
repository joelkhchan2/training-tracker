import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { useAuth } from '../../lib/useAuth'
import { useProfile } from '../../data/profile'

/** Routing shell for the tab-bar pages (Home/History/Programs/Settings). Renders the matched
 *  page via <Outlet/>, a persistent BottomNav, and a "+ Log" FAB whose chooser is gated by the
 *  viewer's enabled disciplines. Distinct from components/ui/AppShell (the per-page header,
 *  unchanged). Strength routes to Home, which owns the session-store seeding needed by
 *  /workout; direct /workout is not seeded and would redirect back to Home. */
export function AppLayout() {
  const nav = useNavigate()
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const [chooserOpen, setChooserOpen] = useState(false)

  const cardioEnabled = (profile?.enabled_disciplines ?? []).includes('cardio')

  function go(path: string) {
    setChooserOpen(false)
    nav(path)
  }

  return (
    <div className="relative">
      <Outlet />

      <button
        type="button"
        aria-label="Log"
        onClick={() => setChooserOpen(true)}
        className="fixed bottom-16 right-4 z-30 h-14 w-14 rounded-full bg-accent text-3xl font-bold text-accent-fg shadow-lg"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        +
      </button>

      {chooserOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setChooserOpen(false)}>
          <div className="w-full space-y-2 rounded-t-2xl bg-surface p-4" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="w-full rounded-xl border border-border bg-bg py-3 text-text"
              onClick={() => go('/')}
            >
              Strength workout
            </button>
            {cardioEnabled ? (
              <button
                type="button"
                className="w-full rounded-xl border border-border bg-bg py-3 text-text"
                onClick={() => go('/cardio/new')}
              >
                Cardio
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <BottomNav />
    </div>
  )
}
