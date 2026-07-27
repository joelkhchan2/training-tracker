import { useRegisterSW } from 'virtual:pwa-register/react'
import { UpdateToast } from './UpdateToast'

/** Service-worker glue for the update toast. With the PWA registered in
 *  'prompt' mode, `needRefresh` flips true once a freshly-deployed service
 *  worker is installed and waiting. Tapping Reload activates it and reloads
 *  the page once — so a deploy lands immediately instead of being masked by
 *  the old precached bundle until a full reinstall.
 *
 *  Thin by design: it imports the PWA virtual module (only available at build
 *  time via vite-plugin-pwa), so all testable UI lives in UpdateToast. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return <UpdateToast onReload={() => updateServiceWorker()} onDismiss={() => setNeedRefresh(false)} />
}
