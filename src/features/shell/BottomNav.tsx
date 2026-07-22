import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'

const TABS = [
  { to: '/', label: 'Home', end: true },
  { to: '/history', label: 'History', end: false },
  { to: '/programs', label: 'Programs', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

/** Fixed bottom tab bar. Sits in the bottom space `components/ui/AppShell` reserves.
 *  Rendered once by `AppLayout`, so it persists across the in-shell routes. */
export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md">
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn('flex-1 py-3 text-center text-sm', isActive ? 'font-semibold text-accent' : 'text-muted')
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
