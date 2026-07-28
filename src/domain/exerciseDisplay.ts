/** First comma-separated token of a free-text muscle string, trimmed; null when the
 *  string is null, empty, or whitespace-only. Mirrors the trim `muscleTokens` (src/domain/
 *  alternates.ts) uses, but keeps only the first token and preserves its original casing —
 *  this is a display subtitle, not a matching key. */
function firstMuscleToken(primaryMuscles: string | null): string | null {
  if (!primaryMuscles) return null
  const first = primaryMuscles.split(',')[0]?.trim()
  return first ? first : null
}

function trimmedOrNull(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Pure. Builds the one-line subtitle every ExercisePicker row shows under its name:
 * the first primary-muscle token (comma-list, trimmed) and equipment (trimmed), joined
 * with " · " when both are present. Returns just the one present piece when only one is,
 * and "" when neither is — callers render no subtitle line for "".
 */
export function formatExerciseSubtitle(primaryMuscles: string | null, equipment: string | null): string {
  const muscle = firstMuscleToken(primaryMuscles)
  const equip = trimmedOrNull(equipment)
  return [muscle, equip].filter((piece): piece is string => piece !== null).join(' · ')
}
