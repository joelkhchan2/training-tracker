/** Presentational "new version available" toast. Pure — no service-worker
 *  coupling — so it unit-tests without the PWA virtual module. UpdatePrompt
 *  owns the service-worker wiring and renders this when an update is waiting.
 *  Docked to the top so it never covers the Finish-workout bar. */
export interface UpdateToastProps {
  onReload: () => void
  onDismiss: () => void
}

export function UpdateToast({ onReload, onDismiss }: UpdateToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto mt-2 flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg">
        <span className="text-sm font-medium text-text">New version available</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-text"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onReload}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}
