import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Discipline } from '../domain'
import { getSupabase } from './supabase'
import type { ProfileRow } from './types'

/** The viewer's profile row. Reused by Settings (discipline toggles) and the shell's
 *  "+ Log" chooser (to gate which disciplines appear). Key `['profile', userId]`. */
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ProfileRow> => {
      const { data, error } = await getSupabase()
        .from('profiles').select('*').eq('id', userId!).single()
      if (error) throw error
      return data as ProfileRow
    },
  })
}

/** Writes the full `enabled_disciplines` array on the caller's profile. */
export function useUpdateDisciplines() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { userId: string; disciplines: Discipline[] }>({
    mutationFn: async ({ userId, disciplines }) => {
      const { error } = await getSupabase()
        .from('profiles').update({ enabled_disciplines: disciplines }).eq('id', userId)
      if (error) throw error
    },
    onSuccess: (_result, { userId }) =>
      queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  })
}
