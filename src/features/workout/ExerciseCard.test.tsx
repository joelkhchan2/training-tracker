import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExerciseCard } from './ExerciseCard'

const ex = { id: 'x1', exerciseId: null, exerciseName: 'Squat', kind: 'strength' as const, sets: [{ weight: 100, reps: 5, done: false }] }

describe('ExerciseCard', () => {
  it('fires onRemove and onReplace from the controls', () => {
    const onRemove = vi.fn(); const onReplace = vi.fn()
    render(<ExerciseCard exIdx={0} exercise={ex} onRemove={onRemove} onReplace={onReplace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Squat' }))
    expect(onRemove).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Replace Squat' }))
    expect(onReplace).toHaveBeenCalled()
  })
  it('hides the weight field for a bodyweight exercise', () => {
    render(<ExerciseCard exIdx={0} exercise={{ ...ex, kind: 'bodyweight' }} onRemove={vi.fn()} onReplace={vi.fn()} />)
    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
  })
  it('excludes a done warmup set from the running volume hint', () => {
    const warmupEx = {
      id: 'x',
      exerciseId: null,
      exerciseName: 'Squat',
      kind: 'strength' as const,
      sets: [
        { weight: 100, reps: 5, done: true, isWarmup: true },
        { weight: 100, reps: 5, done: true },
      ],
    }
    render(<ExerciseCard exIdx={0} exercise={warmupEx} onRemove={vi.fn()} onReplace={vi.fn()} />)
    expect(screen.getByText('500 vol')).toBeInTheDocument() // only the non-warmup set counts
  })
})
