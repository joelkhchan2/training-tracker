import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExerciseCard } from './ExerciseCard'
import { useSessionStore } from './sessionStore'
import { usePrefs } from '../settings/usePrefs'
import type { ExerciseHistorySession } from '../../data/exerciseHistory'

const { useExerciseHistory } = vi.hoisted(() => ({
  useExerciseHistory: vi.fn<(exerciseId: string | null, userId: string | undefined) => { data: ExerciseHistorySession[] | undefined; isLoading: boolean }>(
    () => ({ data: undefined, isLoading: false }),
  ),
}))

vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../data/exerciseHistory', () => ({ useExerciseHistory }))

beforeEach(() => {
  useSessionStore.getState().reset()
})

const ex = {
  id: 'x1',
  exerciseId: null,
  exerciseName: 'Squat',
  kind: 'strength' as const,
  inputType: 'weighted' as const,
  sets: [{ weight: 100, reps: 5, done: false, durationSeconds: null }],
}

describe('ExerciseCard', () => {
  it('fires onRemove and onReplace from the controls', () => {
    const onRemove = vi.fn(); const onReplace = vi.fn()
    render(<ExerciseCard exIdx={0} exercise={ex} exerciseId={null} onRemove={onRemove} onReplace={onReplace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Squat' }))
    expect(onRemove).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Replace Squat' }))
    expect(onReplace).toHaveBeenCalled()
  })
  it('fires onReplace from the ⇄ substitute button', () => {
    const onReplace = vi.fn()
    render(<ExerciseCard exIdx={0} exercise={ex} exerciseId={null} onRemove={vi.fn()} onReplace={onReplace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Substitute Squat' }))
    expect(onReplace).toHaveBeenCalled()
  })
  it('wraps a long exercise name instead of truncating it', () => {
    const longName = 'Barbell Overhead Press With An Extremely Long Accessory Descriptor'
    render(<ExerciseCard exIdx={0} exercise={{ ...ex, exerciseName: longName }} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
    const title = screen.getByRole('button', { name: `Replace ${longName}` })
    expect(title).toHaveClass('break-words')
    expect(title).not.toHaveClass('truncate')
  })

  it('marks the drag handle touch-action:none so pressing it does not pan the page', () => {
    render(<ExerciseCard exIdx={0} exercise={ex} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Reorder Squat' })).toHaveClass('touch-none')
  })

  it('hides the weight field for a bodyweight-inputType exercise', () => {
    render(
      <ExerciseCard
        exIdx={0}
        exercise={{ ...ex, kind: 'bodyweight', inputType: 'bodyweight' }}
        exerciseId={null}
        onRemove={vi.fn()}
        onReplace={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
  })
  it('excludes a done warmup set from the running volume hint', () => {
    const warmupEx = {
      id: 'x',
      exerciseId: null,
      exerciseName: 'Squat',
      kind: 'strength' as const,
      inputType: 'weighted' as const,
      sets: [
        { weight: 100, reps: 5, done: true, isWarmup: true, durationSeconds: null },
        { weight: 100, reps: 5, done: true, durationSeconds: null },
      ],
    }
    render(<ExerciseCard exIdx={0} exercise={warmupEx} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
    expect(screen.getByText('500 vol')).toBeInTheDocument() // only the non-warmup set counts
  })

  describe('history hint + sheet', () => {
    it('shows no "last:" hint and no 🕐 button when exerciseId is null', () => {
      render(<ExerciseCard exIdx={0} exercise={ex} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
      expect(screen.queryByText(/^last:/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /History for/ })).not.toBeInTheDocument()
    })

    it('shows a "last:" hint from history[0] and opens the sheet from the 🕐 button', () => {
      useExerciseHistory.mockReturnValue({
        data: [
          {
            sessionId: 's1',
            date: '2026-07-20',
            e1rm: 165,
            volume: 465,
            sets: [
              { weight: 155, reps: 3, isWarmup: false },
              { weight: 45, reps: 8, isWarmup: true },
            ],
          },
        ],
        isLoading: false,
      })

      render(<ExerciseCard exIdx={0} exercise={ex} exerciseId="ex-1" onRemove={vi.fn()} onReplace={vi.fn()} />)

      expect(screen.getByText('last: 155×3 · 2026-07-20')).toBeInTheDocument()

      const historyButton = screen.getByRole('button', { name: 'History for Squat' })
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
      fireEvent.click(historyButton)
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })

    it('shows a "BW×N" hint for a bodyweight last session with no weight on any set', () => {
      useExerciseHistory.mockReturnValue({
        data: [
          {
            sessionId: 's1',
            date: '2026-07-20',
            e1rm: 0,
            volume: 0,
            sets: [
              { weight: null, reps: 6, isWarmup: false },
              { weight: null, reps: 8, isWarmup: false },
            ],
          },
        ],
        isLoading: false,
      })

      render(
        <ExerciseCard
          exIdx={0}
          exercise={{ ...ex, kind: 'bodyweight', inputType: 'bodyweight' }}
          exerciseId="ex-1"
          onRemove={vi.fn()}
          onReplace={vi.fn()}
        />,
      )

      expect(screen.getByText('last: BW×8 · 2026-07-20')).toBeInTheDocument()
    })
  })

  it('shows all 4 input-type options in the override Select and calls setInputType on change', () => {
    useSessionStore.getState().startFromPrescription(
      [{ exerciseName: 'Squat', tmKey: 'squat', sets: [{ weight: 100, reps: 5 }] }] as never,
      { sessionType: 'A', dayName: 'A', dayIndex: 0, clientId: 'c1', startedAt: new Date().toISOString() },
    )
    function Wrapper() {
      const exercise = useSessionStore((s) => s.exercises[0])
      return <ExerciseCard exIdx={0} exercise={exercise} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />
    }
    render(<Wrapper />)

    const select = screen.getByLabelText('Log as') as HTMLSelectElement
    const optionLabels = Array.from(select.options).map((o) => o.textContent)
    expect(optionLabels).toEqual(['Weight × Reps', 'Bodyweight', 'Timed', 'Weighted + Timed'])

    fireEvent.change(select, { target: { value: 'timed' } })
    expect(useSessionStore.getState().exercises[0].inputType).toBe('timed')
  })

  it('shows "—" for doneVolume when every set is timed (weight-less sets never count toward volume)', () => {
    const timedEx = {
      id: 'x-timed', exerciseId: null, exerciseName: 'Plank', kind: 'strength' as const, inputType: 'timed' as const,
      sets: [{ weight: null, reps: null, done: true, durationSeconds: 45 }],
    }
    render(<ExerciseCard exIdx={0} exercise={timedEx} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
    // Scoped to `span` because the RPE dropdown (added since this brief was written) also
    // renders a literal '—' as its unset-value option text.
    expect(screen.getByText('—', { selector: 'span' })).toBeInTheDocument()
  })
})

describe('ExerciseCard — kg mode', () => {
  afterEach(() => usePrefs.setState({ weightUnit: 'lb' }))

  it('the "last:" top-set hint shows the converted, kg-suffixed weight', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    useExerciseHistory.mockReturnValue({
      data: [
        {
          sessionId: 's1', date: '2026-07-20', e1rm: 165, volume: 465,
          sets: [{ weight: 155, reps: 3, isWarmup: false }, { weight: 45, reps: 8, isWarmup: true }],
        },
      ],
      isLoading: false,
    })
    render(<ExerciseCard exIdx={0} exercise={ex} exerciseId="ex-1" onRemove={vi.fn()} onReplace={vi.fn()} />)
    expect(screen.getByText('last: 70.3 kg×3 · 2026-07-20')).toBeInTheDocument() // 155 lb -> 70.3 kg
  })

  it('the running "vol" hint shows the converted, kg-suffixed volume', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    const doneEx = {
      id: 'x', exerciseId: null, exerciseName: 'Squat', kind: 'strength' as const, inputType: 'weighted' as const,
      sets: [{ weight: 100, reps: 5, done: true, durationSeconds: null }],
    }
    render(<ExerciseCard exIdx={0} exercise={doneEx} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
    // doneVolume = 100*5 = 500 lb -> formatWeight(500, 'kg') = "226.8 kg"
    expect(screen.getByText('226.8 kg vol')).toBeInTheDocument()
  })
})

describe('ExerciseCard — per-exercise auto-fill override', () => {
  afterEach(() => usePrefs.setState({ autoFillSets: true, autoFillSetsByExercise: {} }))

  it('reflects the global default when unset and writes a per-exercise override on toggle', () => {
    usePrefs.setState({ autoFillSets: true, autoFillSetsByExercise: {} })
    render(<ExerciseCard exIdx={0} exercise={ex} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)

    const toggle = screen.getByLabelText('Auto-fill sets for Squat') as HTMLInputElement
    expect(toggle).toBeChecked() // inherits the global default (true)

    fireEvent.click(toggle)
    expect(usePrefs.getState().autoFillSetsByExercise).toEqual({ Squat: false })
    expect(toggle).not.toBeChecked()
  })

  it('an existing per-exercise override wins over the global default', () => {
    usePrefs.setState({ autoFillSets: true, autoFillSetsByExercise: { Squat: false } })
    render(<ExerciseCard exIdx={0} exercise={ex} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
    expect(screen.getByLabelText('Auto-fill sets for Squat')).not.toBeChecked()
  })
})
