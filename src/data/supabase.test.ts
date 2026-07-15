import { describe, it, expect, afterEach, vi } from 'vitest'
import { getSupabase } from './supabase'

describe('getSupabase', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the same client instance across calls (singleton)', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    const first = getSupabase()
    const second = getSupabase()

    expect(first).toBe(second)
  })
})
