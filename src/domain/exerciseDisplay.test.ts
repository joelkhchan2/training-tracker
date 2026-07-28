import { describe, expect, it } from 'vitest'
import { formatExerciseSubtitle } from './exerciseDisplay'

describe('formatExerciseSubtitle', () => {
  it('joins the first muscle token and equipment with " · " when both are present', () => {
    expect(formatExerciseSubtitle('quadriceps, glutes', 'barbell')).toBe('quadriceps · barbell')
  })

  it('trims and takes only the first comma-separated muscle token', () => {
    expect(formatExerciseSubtitle('  Quadriceps ,  Glutes ', 'barbell')).toBe('Quadriceps · barbell')
  })

  it('returns just the muscle piece when equipment is null', () => {
    expect(formatExerciseSubtitle('quadriceps, glutes', null)).toBe('quadriceps')
  })

  it('returns just the muscle piece when equipment is empty/whitespace', () => {
    expect(formatExerciseSubtitle('quadriceps', '   ')).toBe('quadriceps')
  })

  it('returns just the equipment piece when primaryMuscles is null', () => {
    expect(formatExerciseSubtitle(null, 'barbell')).toBe('barbell')
  })

  it('returns just the equipment piece when primaryMuscles is empty/whitespace', () => {
    expect(formatExerciseSubtitle('   ', 'barbell')).toBe('barbell')
  })

  it('returns "" when neither piece is present', () => {
    expect(formatExerciseSubtitle(null, null)).toBe('')
    expect(formatExerciseSubtitle('  ', '  ')).toBe('')
  })

  it('trims surrounding whitespace on the equipment piece', () => {
    expect(formatExerciseSubtitle(null, '  barbell  ')).toBe('barbell')
  })
})
