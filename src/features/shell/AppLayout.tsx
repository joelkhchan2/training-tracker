import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { LogMenuSheet } from './LogMenuSheet'

/** Routing shell for the tab-bar pages (Home/History/Programs/Settings). Renders the matched
 *  page via <Outlet/>, a persistent BottomNav, and a "+ Log" FAB whose chooser is gated by the
 *  viewer's enabled disciplines. Distinct from components/ui/AppShell (the per-page header,
 *  unchanged). Strength routes to Home, which owns the session-store seeding needed by
 *  /workout; direct /workout is not seeded and would redirect back to Home. */
export function AppLayout() {
  const [chooserOpen, setChooserOpen] = useState(false)

  return (
    <div className="relative">
      <Outlet />

      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-30" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="relative mx-auto w-full max-w-md">
          <button
            type="button"
            aria-label="Log"
            onClick={() => setChooserOpen(true)}
            className="pointer-events-auto absolute bottom-0 right-4 h-14 w-14 rounded-full bg-accent text-3xl font-bold text-accent-fg shadow-lg"
          >
            +
          </button>
        </div>
      </div>

      <LogMenuSheet open={chooserOpen} onClose={() => setChooserOpen(false)} />

      <BottomNav />
    </div>
  )
}
