/** Friendly labels for the `tmKey`s used by percentage-based programs (5/3/1 et al.).
 *  Shared by the activation flow and the training-max editor so the two never drift.
 *  Falls back to the raw key for any future key this map hasn't been updated for. */
export const TM_LABELS: Record<string, string> = {
  squat: 'Squat',
  benchPress: 'Bench Press',
  barbellDeadlift: 'Deadlift',
  overheadPress: 'Overhead Press',
}

export function labelForKey(key: string): string {
  return TM_LABELS[key] ?? key
}
