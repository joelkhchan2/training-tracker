import { describe, it, expect } from 'vitest'
import { hardNormalizeExerciseName } from './exerciseName'

describe('hardNormalizeExerciseName', () => {
  it('treats hyphenation and plural as equal: Pull-ups == Pull Ups', () => {
    expect(hardNormalizeExerciseName('Pull-ups')).toBe(hardNormalizeExerciseName('Pull Ups'))
  })

  it('is insensitive to token order: Bent Over Barbell Row == Barbell Bent Over Row', () => {
    expect(hardNormalizeExerciseName('Bent Over Barbell Row')).toBe(
      hardNormalizeExerciseName('Barbell Bent Over Row')
    )
  })

  it('treats plural as equal: Face Pulls == Face Pull', () => {
    expect(hardNormalizeExerciseName('Face Pulls')).toBe(hardNormalizeExerciseName('Face Pull'))
  })

  it('does not collapse different implement tokens: Barbell Row != Dumbbell Row', () => {
    expect(hardNormalizeExerciseName('Barbell Row')).not.toBe(
      hardNormalizeExerciseName('Dumbbell Row')
    )
  })

  it('does not collapse an extra token: Incline Bench Press != Bench Press', () => {
    expect(hardNormalizeExerciseName('Incline Bench Press')).not.toBe(
      hardNormalizeExerciseName('Bench Press')
    )
  })

  it('does not collapse opposite direction tokens: Front Squat != Back Squat', () => {
    expect(hardNormalizeExerciseName('Front Squat')).not.toBe(
      hardNormalizeExerciseName('Back Squat')
    )
  })

  it('does NOT collapse equipment-prefix semantic dupes (that is canonical_id\'s job): Squat != Barbell Back Squat', () => {
    expect(hardNormalizeExerciseName('Squat')).not.toBe(
      hardNormalizeExerciseName('Barbell Back Squat')
    )
  })
})
