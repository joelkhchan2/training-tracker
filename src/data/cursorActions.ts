import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cursor, Program } from '../domain'
import { advanceCursor } from '../domain'
import { getSupabase } from './supabase'

/** Writes a new cursor to the caller's own `program_state` row (RLS-scoped to auth.uid()).
 *  Shared by skip (advance) and pick (set day). No session, no log — a plain cursor move.
 *
 *  Also clears `last_advance_key`: that key gates `log_climbing`/`log_cardio`'s RPC advance
 *  (`where last_advance_key is distinct from p_last_advance_key`, migration 0017) and is a
 *  pure function of destination position (`${cycle}-${week}-${dayIndex}`, mutations.ts). A
 *  manual pick can move the cursor backward onto a position whose key was already stored by
 *  an earlier logged day; leaving the stale key in place would make the next logged save at
 *  that position collide with it and silently skip the advance. `null` is never a real stored
 *  key, so it's always distinct — the next logged save advances normally — while genuine RPC
 *  retries still no-op against their own stored key (that key isn't cleared by this path). */
async function writeCursor(cursor: Cursor): Promise<void> {
  const supabase = getSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData?.user?.id
  if (!userId) throw new Error('Not authenticated')
  const { error } = await supabase.from('program_state').update({ cursor, last_advance_key: null }).eq('user_id', userId)
  if (error) throw error
}

/** Skip today: advance the cursor exactly as a logged day would (rolls week/cycle at the ends),
 *  without logging anything. Value-based idempotent, like every cursor write. */
export function useAdvanceCursor() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { program: Program; cursor: Cursor }>({
    mutationFn: async ({ program, cursor }) => {
      const { cursor: next } = advanceCursor(program, cursor)
      await writeCursor(next)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activeWorkout'] }),
  })
}

/** Pick a different day to do now: move only `dayIndex`, preserving week and cycle (deliberately
 *  never rolls the schedule — that's what skip is for). */
export function useSetCursorDay() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { cursor: Cursor; dayIndex: number }>({
    mutationFn: async ({ cursor, dayIndex }) => {
      await writeCursor({ dayIndex, week: cursor.week, cycle: cursor.cycle })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activeWorkout'] }),
  })
}
