import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],   // so future .tsx component tests can transform JSX
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
})
