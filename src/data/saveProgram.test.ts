import { describe, expect, it } from 'vitest'
import { buildProgramRows } from './saveProgram'
import type { ProgramDraft } from '../domain/programDraft'

function draftWith(overrides: Partial<ProgramDraft> = {}): ProgramDraft {
  return {
    name: 'My Program',
    description: 'A test program',
    isPublic: true,
    days: [
      {
        name: 'Day 1',
        exercises: [
          { exerciseName: 'Bench Press', kind: 'strength', sets: [{ reps: 5, weight: 100 }] },
          { exerciseName: 'Push Up', kind: 'bodyweight', sets: [{ reps: 10 }] },
        ],
      },
    ],
    ...overrides,
  }
}

describe('buildProgramRows', () => {
  it('builds a program row wired to the given programId, with name/description/discipline/is_public from the draft', () => {
    const draft = draftWith({ isPublic: true })
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)

    expect(rows.program).toEqual({
      id: 'prog-1',
      name: 'My Program',
      description: 'A test program',
      discipline: 'strength',
      is_public: true,
    })
  })

  it('propagates is_public: false when the draft is not public', () => {
    const draft = draftWith({ isPublic: false })
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)

    expect(rows.program.is_public).toBe(false)
  })

  it('builds one day row per draft day, wired to programId with sequential order_index', () => {
    const draft = draftWith()
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)

    expect(rows.days).toEqual([
      { id: 'day-1', program_id: 'prog-1', name: 'Day 1', order_index: 0 },
    ])
  })

  it('builds exercise rows wired to their day, with resolved exercise_id, order_index within the day, role_key null, and exercise_name/exercise_type from the draft', () => {
    const draft = draftWith()
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)

    expect(rows.exercises).toEqual([
      {
        program_day_id: 'day-1',
        exercise_id: 'ex-bench',
        role_key: null,
        order_index: 0,
        scheme: { type: 'fixed', sets: [{ reps: 5, weight: 100 }] },
        exercise_name: 'Bench Press',
        exercise_type: 'weighted',
      },
      {
        program_day_id: 'day-1',
        exercise_id: 'ex-pushup',
        role_key: null,
        order_index: 1,
        scheme: { type: 'fixed', sets: [{ reps: 10 }] },
        exercise_name: 'Push Up',
        exercise_type: 'bodyweight',
      },
    ])
  })

  it('omits the weight key from bodyweight scheme sets (never weight: undefined)', () => {
    const draft = draftWith()
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)
    const pushUpRow = rows.exercises[1]

    expect(pushUpRow.scheme).toEqual({ type: 'fixed', sets: [{ reps: 10 }] })
    if (pushUpRow.scheme.type === 'fixed') {
      expect('weight' in pushUpRow.scheme.sets[0]).toBe(false)
    }
  })
})
