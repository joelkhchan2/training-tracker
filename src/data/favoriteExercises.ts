import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/useAuth'
import { getSupabase } from './supabase'
import { resolveExerciseListItems } from './exerciseListItems'
import type { ExerciseListItem } from './exerciseCatalog'

export interface FavoritesState {
  items: ExerciseListItem[]
  ids: Set<string>
}

const EMPTY: FavoritesState = { items: [], ids: new Set() }

/**
 * The user's favorited exercises, most-recently-favorited first, resolved through the same
 * canonicalization pass Recent uses (a favorited row can later become a merge alias) and
 * with any since-deactivated row dropped. Backs both the Favorites section's item list AND
 * the `ids` Set every section's star toggle reads its favorited/unfavorited state from —
 * they're derived from one query so a favorite added optimistically shows up as favorited
 * everywhere instantly, not just in the Favorites list itself.
 */
export function useFavoriteExercises(userId: string | undefined): FavoritesState {
  const { data } = useQuery({
    queryKey: ['favorites', userId],
    enabled: !!userId,
    queryFn: async (): Promise<FavoritesState> => {
      const supabase = getSupabase()
      const { data: favoriteRows, error } = await supabase
        .from('favorite_exercises')
        .select('exercise_id')
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false })
      if (error) throw error

      const rawIds = (favoriteRows ?? []).map((row) => row.exercise_id as string)
      const items = await resolveExerciseListItems(rawIds, userId as string)
      return { items, ids: new Set(items.map((item) => item.id)) }
    },
  })
  return data ?? EMPTY
}

/**
 * Favorite/unfavorite toggle. `userId` comes from this hook's own `useAuth` call, not the
 * mutate payload — every call site already has the full `ExerciseListItem` on hand (it's
 * rendering that row), so `mutate({ item, isFavorited })` carries the whole item rather than
 * just an id. Optimistic: `onMutate` snapshots `['favorites', userId]` and writes the toggle
 * into it immediately (add: append `item` to `items` + add its id to `ids`; remove: filter
 * `items` down to non-matching rows + delete the id from `ids`), so a favorited-but-not-yet-
 * refetched row appears under Favorites instantly. `onError` restores the snapshot.
 * `onSettled` invalidates `['favorites', userId]` — no other query key needs invalidating,
 * since Recent/Common/Suggested read favorited state from this same `ids` Set, not their own
 * query.
 */
export function useToggleFavorite() {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()

  return useMutation<void, Error, { item: ExerciseListItem; isFavorited: boolean }, { previous: FavoritesState | undefined }>({
    mutationFn: async ({ item, isFavorited }) => {
      const supabase = getSupabase()
      if (isFavorited) {
        const { error } = await supabase
          .from('favorite_exercises')
          .delete()
          .eq('user_id', userId as string)
          .eq('exercise_id', item.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('favorite_exercises')
          .insert({ user_id: userId, exercise_id: item.id })
        if (error) throw error
      }
    },
    onMutate: async ({ item, isFavorited }) => {
      // Cancel any in-flight refetch so it can't land after and clobber the optimistic write.
      await queryClient.cancelQueries({ queryKey: ['favorites', userId] })
      const previous = queryClient.getQueryData<FavoritesState>(['favorites', userId])
      const base = previous ?? EMPTY
      const next: FavoritesState = isFavorited
        ? { items: base.items.filter((i) => i.id !== item.id), ids: new Set([...base.ids].filter((id) => id !== item.id)) }
        : { items: [...base.items, item], ids: new Set([...base.ids, item.id]) }
      queryClient.setQueryData(['favorites', userId], next)
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (!context) return
      if (context.previous === undefined) {
        queryClient.removeQueries({ queryKey: ['favorites', userId] })
      } else {
        queryClient.setQueryData(['favorites', userId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', userId] })
    },
  })
}
