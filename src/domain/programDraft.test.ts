import { describe, it, expect } from 'vitest'
import {
  draftToProgram,
  validateDraft,
  programRowsToDraft,
  type ProgramDraft,
  type ProgramRowsLike,
} from './programDraft'

describe('draftToProgram', () => {
  it('maps a 1-day draft with one strength exercise to a Program with fixed scheme + order', () => {
    const draft: ProgramDraft = {
      name: 'My Program',
      description: 'desc',
      isPublic: false,
      days: [
        {
          name: 'Day 1',
          exercises: [
            {
              exerciseName: 'Squat',
              kind: 'strength',
              sets: [
                { reps: 12, weight: 90 },
                { reps: 12, weight: 90 },
                { reps: 12, weight: 90 },
              ],
            },
          ],
        },
      ],
    }

    const program = draftToProgram(draft)

    expect(program.discipline).toBe('strength')
    expect(program.days).toHaveLength(1)
    expect(program.days[0].exercises).toHaveLength(1)
    const ex = program.days[0].exercises[0]
    expect(ex.exerciseName).toBe('Squat')
    expect(ex.order).toBe(0)
    expect(ex.scheme).toEqual({
      type: 'fixed',
      sets: [
        { reps: 12, weight: 90 },
        { reps: 12, weight: 90 },
        { reps: 12, weight: 90 },
      ],
    })
  })

  it('omits the weight key entirely for bodyweight sets', () => {
    const draft: ProgramDraft = {
      name: 'BW Program',
      description: '',
      isPublic: true,
      days: [
        {
          name: 'Day 1',
          exercises: [
            {
              exerciseName: 'Push-up',
              kind: 'bodyweight',
              sets: [{ reps: 20 }, { reps: 15 }],
            },
          ],
        },
      ],
    }

    const program = draftToProgram(draft)
    const scheme = program.days[0].exercises[0].scheme
    expect(scheme.type).toBe('fixed')
    if (scheme.type !== 'fixed') throw new Error('expected fixed scheme')
    for (const set of scheme.sets) {
      expect('weight' in set).toBe(false)
    }
    expect(scheme.sets).toEqual([{ reps: 20 }, { reps: 15 }])
  })

  it('omits the weight key for a strength set whose weight is undefined', () => {
    const draft: ProgramDraft = {
      name: 'Strength no weight',
      description: '',
      isPublic: false,
      days: [
        {
          name: 'Day 1',
          exercises: [
            {
              exerciseName: 'Bench',
              kind: 'strength',
              sets: [{ reps: 10 }],
            },
          ],
        },
      ],
    }

    const program = draftToProgram(draft)
    const scheme = program.days[0].exercises[0].scheme
    if (scheme.type !== 'fixed') throw new Error('expected fixed scheme')
    expect('weight' in scheme.sets[0]).toBe(false)
  })

  it('preserves day and exercise order', () => {
    const draft: ProgramDraft = {
      name: 'Multi-day',
      description: '',
      isPublic: false,
      days: [
        {
          name: 'Day A',
          exercises: [
            { exerciseName: 'Ex1', kind: 'strength', sets: [{ reps: 5, weight: 100 }] },
            { exerciseName: 'Ex2', kind: 'strength', sets: [{ reps: 5, weight: 100 }] },
          ],
        },
        {
          name: 'Day B',
          exercises: [
            { exerciseName: 'Ex3', kind: 'bodyweight', sets: [{ reps: 8 }] },
          ],
        },
      ],
    }

    const program = draftToProgram(draft)
    expect(program.days.map(d => d.name)).toEqual(['Day A', 'Day B'])
    expect(program.days[0].exercises.map(e => e.exerciseName)).toEqual(['Ex1', 'Ex2'])
    expect(program.days[0].exercises.map(e => e.order)).toEqual([0, 1])
    expect(program.days[1].exercises[0].order).toBe(0)
  })

  it('does not set a progressionRule', () => {
    const draft: ProgramDraft = {
      name: 'No progression',
      description: '',
      isPublic: false,
      days: [{ name: 'Day 1', exercises: [{ exerciseName: 'Ex', kind: 'strength', sets: [{ reps: 5, weight: 50 }] }] }],
    }
    const program = draftToProgram(draft)
    expect(program.progressionRule).toBeUndefined()
  })
})

describe('validateDraft', () => {
  const validDraft: ProgramDraft = {
    name: 'Valid',
    description: '',
    isPublic: false,
    days: [
      {
        name: 'Day 1',
        exercises: [
          { exerciseName: 'Squat', kind: 'strength', sets: [{ reps: 5, weight: 100 }] },
        ],
      },
    ],
  }

  it('returns [] for a valid draft', () => {
    expect(validateDraft(validDraft)).toEqual([])
  })

  it('flags an empty name', () => {
    const draft = { ...validDraft, name: '' }
    expect(validateDraft(draft).length).toBeGreaterThan(0)
  })

  it('flags zero days', () => {
    const draft = { ...validDraft, days: [] }
    expect(validateDraft(draft).length).toBeGreaterThan(0)
  })

  it('flags a day with zero exercises', () => {
    const draft = { ...validDraft, days: [{ name: 'Day 1', exercises: [] }] }
    expect(validateDraft(draft).length).toBeGreaterThan(0)
  })

  it('flags an exercise with zero sets', () => {
    const draft = {
      ...validDraft,
      days: [{ name: 'Day 1', exercises: [{ exerciseName: 'Squat', kind: 'strength' as const, sets: [] }] }],
    }
    expect(validateDraft(draft).length).toBeGreaterThan(0)
  })

  it('flags a set with reps < 1', () => {
    const draft = {
      ...validDraft,
      days: [
        {
          name: 'Day 1',
          exercises: [{ exerciseName: 'Squat', kind: 'strength' as const, sets: [{ reps: 0, weight: 100 }] }],
        },
      ],
    }
    expect(validateDraft(draft).length).toBeGreaterThan(0)
  })

  it('returns one message per failed rule', () => {
    const draft: ProgramDraft = { name: '', description: '', isPublic: false, days: [] }
    // empty name + zero days = 2 failed rules
    expect(validateDraft(draft).length).toBe(2)
  })
})

describe('programRowsToDraft', () => {
  it('sorts days and exercises by order_index, recovers kind, name fallback, and carries name/description/isPublic', () => {
    const rows: ProgramRowsLike = {
      name: 'Row Program',
      description: 'a description',
      is_public: true,
      days: [
        {
          name: 'Day B',
          order_index: 1,
          exercises: [
            {
              exercise_name: null,
              exercise_type: 'strength',
              role_key: 'squat',
              order_index: 0,
              scheme: { type: 'fixed', sets: [{ reps: 5, weight: 100 }] },
            },
          ],
        },
        {
          name: 'Day A',
          order_index: 0,
          exercises: [
            {
              exercise_name: 'Push-up',
              exercise_type: 'bodyweight',
              role_key: null,
              order_index: 1,
              scheme: { type: 'fixed', sets: [{ reps: 20 }] },
            },
            {
              exercise_name: 'Bench Press',
              exercise_type: 'strength',
              role_key: null,
              order_index: 0,
              scheme: { type: 'fixed', sets: [{ reps: 8, weight: 135 }] },
            },
          ],
        },
      ],
    }

    const draft = programRowsToDraft(rows)

    expect(draft.name).toBe('Row Program')
    expect(draft.description).toBe('a description')
    expect(draft.isPublic).toBe(true)
    expect(draft.days.map(d => d.name)).toEqual(['Day A', 'Day B'])
    expect(draft.days[0].exercises.map(e => e.exerciseName)).toEqual(['Bench Press', 'Push-up'])
    expect(draft.days[0].exercises[1].kind).toBe('bodyweight')
    expect(draft.days[1].exercises[0].exerciseName).toBe('squat')
    expect(draft.days[1].exercises[0].kind).toBe('strength')
  })

  it('falls back to "Unknown exercise" when both exercise_name and role_key are null', () => {
    const rows: ProgramRowsLike = {
      name: 'P',
      description: null,
      is_public: false,
      days: [
        {
          name: 'Day 1',
          order_index: 0,
          exercises: [
            {
              exercise_name: null,
              exercise_type: null,
              role_key: null,
              order_index: 0,
              scheme: { type: 'fixed', sets: [{ reps: 5 }] },
            },
          ],
        },
      ],
    }
    const draft = programRowsToDraft(rows)
    expect(draft.days[0].exercises[0].exerciseName).toBe('Unknown exercise')
    expect(draft.days[0].exercises[0].kind).toBe('strength')
  })

  it('omits weight in mapped sets when scheme set has no weight', () => {
    const rows: ProgramRowsLike = {
      name: 'P',
      description: null,
      is_public: false,
      days: [
        {
          name: 'Day 1',
          order_index: 0,
          exercises: [
            {
              exercise_name: 'Push-up',
              exercise_type: 'bodyweight',
              role_key: null,
              order_index: 0,
              scheme: { type: 'fixed', sets: [{ reps: 20 }] },
            },
          ],
        },
      ],
    }
    const draft = programRowsToDraft(rows)
    expect(draft.days[0].exercises[0].sets).toEqual([{ reps: 20 }])
    expect('weight' in draft.days[0].exercises[0].sets[0]).toBe(false)
  })

  it('throws a clear error when a scheme is not fixed', () => {
    const rows: ProgramRowsLike = {
      name: 'P',
      description: null,
      is_public: false,
      days: [
        {
          name: 'Day 1',
          order_index: 0,
          exercises: [
            {
              exercise_name: 'Squat',
              exercise_type: 'strength',
              role_key: null,
              order_index: 0,
              scheme: { type: 'linear', sets: [{ reps: 5 }], progression: { increment: 5, deloadPercent: 0.9, failsBeforeDeload: 3 } },
            },
          ],
        },
      ],
    }
    expect(() => programRowsToDraft(rows)).toThrow(/fixed/i)
  })

  it('round-trips: draft -> fake rows -> programRowsToDraft deep-equals the original', () => {
    const original: ProgramDraft = {
      name: 'Round Trip',
      description: 'desc',
      isPublic: true,
      days: [
        {
          name: 'Day 1',
          exercises: [
            { exerciseName: 'Squat', kind: 'strength', sets: [{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }] },
            { exerciseName: 'Push-up', kind: 'bodyweight', sets: [{ reps: 20 }] },
          ],
        },
        {
          name: 'Day 2',
          exercises: [
            { exerciseName: 'Bench', kind: 'strength', sets: [{ reps: 8 }] },
          ],
        },
      ],
    }

    const program = draftToProgram(original)

    const fakeRows: ProgramRowsLike = {
      name: original.name,
      description: original.description,
      is_public: original.isPublic,
      days: program.days.map((day, dIdx) => ({
        name: day.name,
        order_index: dIdx,
        exercises: day.exercises.map((ex, eIdx) => {
          const draftEx = original.days[dIdx].exercises[eIdx]
          return {
            exercise_name: draftEx.exerciseName,
            exercise_type: draftEx.kind,
            role_key: null,
            order_index: eIdx,
            scheme: ex.scheme,
          }
        }),
      })),
    }

    const roundTripped = programRowsToDraft(fakeRows)
    expect(roundTripped).toEqual(original)
  })
})
