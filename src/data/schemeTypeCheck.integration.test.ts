/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anon = process.env.VITE_SUPABASE_ANON_KEY

async function makeUser(email: string) {
  const c = createClient(url, anon!, { auth: { storageKey: `sb-test-${email}` } })
  await c.auth.signUp({ email, password: 'passw0rd!' })
  const { data } = await c.auth.signInWithPassword({ email, password: 'passw0rd!' })
  return { client: c, userId: data.user!.id }
}

async function makeProgramDay(client: SupabaseClient, userId: string): Promise<string> {
  const { data: program, error: programErr } = await client
    .from('programs')
    .insert({ user_id: userId, name: `Timed Scheme Test ${Date.now()}`, discipline: 'strength' })
    .select('id')
    .single()
  if (programErr) throw programErr
  const { data: day, error: dayErr } = await client
    .from('program_days')
    .insert({ program_id: program.id, name: 'Day A', order_index: 0 })
    .select('id')
    .single()
  if (dayErr) throw dayErr
  return day.id as string
}

// Migration 0015 widens program_exercises_scheme_type_valid (0011) to accept 'timed'.
// This is a regression guard proving the widen is neither a no-op (case a) nor an
// accidental full removal of the constraint (case b).
describe.skipIf(!anon)('program_exercises scheme-type CHECK constraint (migration 0015)', () => {
  it('accepts a timed scheme', async () => {
    const { client, userId } = await makeUser(`timedscheme_${Date.now()}@test.dev`)
    const dayId = await makeProgramDay(client, userId)

    const { error } = await client
      .from('program_exercises')
      .insert({
        program_day_id: dayId,
        role_key: 'frontLever',
        order_index: 0,
        scheme: { type: 'timed', sets: [{ seconds: 8 }, { seconds: 8 }, { seconds: 8 }, { seconds: 8 }] },
      })
    expect(error).toBeNull()
  })

  it('still rejects a genuinely unknown scheme type', async () => {
    const { client, userId } = await makeUser(`badscheme_${Date.now()}@test.dev`)
    const dayId = await makeProgramDay(client, userId)

    const { error } = await client
      .from('program_exercises')
      .insert({
        program_day_id: dayId,
        role_key: 'mystery',
        order_index: 0,
        scheme: { type: 'percentage_flat', sets: [] },
      })
    expect(error).not.toBeNull()
  })
})
