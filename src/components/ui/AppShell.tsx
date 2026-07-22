import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface AppShellProps {
  title: string
  /** Optional content docked to the right of the header (e.g. an action button). */
  right?: ReactNode
  children?: ReactNode
  className?: string
}

/** Page-level layout: a sticky header (title + optional right slot) and a
 *  scrollable content area, both respecting device safe-area insets. Leaves
 *  room at the bottom of `main` for a future sticky bottom nav. */
export function AppShell({ title, right, children, className }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header
        className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur-sm"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
        </div>
      </header>
      <main
        className={cn('flex-1 px-4 py-4', className)}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
      >
        {children}
      </main>
      {/* Bottom space cleared by the main padding above for AppLayout's fixed BottomNav. */}
    </div>
  )
}
