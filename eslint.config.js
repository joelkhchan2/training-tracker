import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config(
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-*', '@supabase/*'],
            message: 'src/domain must stay framework-free (no React/Supabase imports).' },
        ],
      }],
    },
  },
  {
    files: ['src/lib/AuthProvider.tsx'],
    rules: {
      // This file intentionally exports both the AuthContext and the AuthProvider
      // component so useAuth.ts can import the context directly.
      'react-refresh/only-export-components': 'off',
    },
  },
)
