import { useRegisterSW } from 'virtual:pwa-register/react'
import { UpdateToast } from './UpdateToast'

/** Service-worker glue for the update toast. With the PWA registered in
 *  'prompt' mode, `needRefresh` flips true once a freshly-deployed service
 *  worker is installed and waiting. Tapping Reload activates it and reloads
 *  the page once — so a deploy lands immediately instead of being masked by
 *  the old precached bundle until a full reinstall.
 *
 *  `onRegisteredSW` adds active update detection: the browser only checks for a
 *  new service worker on its own schedule, so an installed app that stays open
 *  (or is backgrounded and reopened) could sit on a stale bundle indefinitely.
 *  We re-check on an interval and every time the app returns to the foreground,
 *  so a new deploy surfaces the toast promptly without a manual hard-reload.
 *
 *  Thin by design: it imports the PWA virtual module (only available at build
 *  time via vite-plugin-pwa), so all testable UI lives in UpdateToast. */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const check = () => { void registration.update().catch(() => {}) }
      setInterval(check, UPDATE_CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  if (!needRefresh) return null

  return <UpdateToast onReload={() => updateServiceWorker()} onDismiss={() => setNeedRefresh(false)} />
}
