import { copyFileSync } from 'node:fs'
copyFileSync('dist/index.html', 'dist/404.html')
console.log('Wrote dist/404.html (SPA deep-link fallback)')
