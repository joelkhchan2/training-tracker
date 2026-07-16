import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, beforeEach } from 'vitest'
import { WorkoutPage } from './WorkoutPage'
import { useSessionStore } from './sessionStore'
import type { PrescribedExercise } from '../../domain/types'

const prescription: PrescribedExercise[] = [
  {
    exerciseName: 'Squat',
    tmKey: 'squat',
    sets: [
      { weight: 135, reps: 5 },
      { weight: 155, reps: 5, isFsl: true },
      { weight: 175, reps: 3 },
    ],
  },
  {
    exerciseName: 'Push-up',
    sets: [
      { reps: 10 },
      { reps: 10 },
    ],
  },
]

const meta = {
  sessionType: '5/3/1',
  dayName: 'Squat Day',
  dayIndex: 0,
  clientId: 'client-123',
  startedAt: '2026-07-12T00:00:00.000Z',
}

function renderAtWorkout() {
  return render(
    <MemoryRouter initialEntries={['/workout']}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route path="/workout" element={<WorkoutPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useSessionStore.getState().reset()
})

describe('WorkoutPage', () => {
  it('renders an ExerciseCard per exercise and a SetRow per set with prefilled values', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    expect(screen.getByRole('heading', { name: 'Squat Day' })).toBeInTheDocument()
    expect(screen.getByText('Squat')).toBeInTheDocument()
    expect(screen.getByText('Push-up')).toBeInTheDocument()

    const squatCard = screen.getByTestId('exercise-card-0')
    expect(within(squatCard).getAllByTestId(/^set-row-0-/)).toHaveLength(3)

    const firstSet = screen.getByTestId('set-row-0-0')
    expect(within(firstSet).getByLabelText('Weight')).toHaveValue('135')
    expect(within(firstSet).getByLabelText('Reps')).toHaveValue('5')

    // FSL tag on the second squat set only
    const secondSet = screen.getByTestId('set-row-0-1')
    expect(within(secondSet).getByText('FSL')).toBeInTheDocument()
    expect(within(firstSet).queryByText('FSL')).not.toBeInTheDocument()

    const pushupCard = screen.getByTestId('exercise-card-1')
    expect(within(pushupCard).getAllByTestId(/^set-row-1-/)).toHaveLength(2)
  })

  it('editing the weight field updates the session store and the displayed value', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    const firstSet = screen.getByTestId('set-row-0-0')
    const weightInput = within(firstSet).getByLabelText('Weight')
    fireEvent.change(weightInput, { target: { value: '140' } })

    expect(weightInput).toHaveValue('140')
    expect(useSessionStore.getState().exercises[0].sets[0].weight).toBe(140)
  })

  it('toggling done marks the set as done in the store and visually', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    const firstSet = screen.getByTestId('set-row-0-0')
    const doneToggle = within(firstSet).getByLabelText('Set 1 done')
    expect(doneToggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(doneToggle)

    expect(doneToggle).toHaveAttribute('aria-pressed', 'true')
    expect(useSessionStore.getState().exercises[0].sets[0].done).toBe(true)
  })

  it('"+ Add set" appends a new row to the target exercise only', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    const squatCard = screen.getByTestId('exercise-card-0')
    fireEvent.click(within(squatCard).getByRole('button', { name: '+ Add set' }))

    expect(screen.getByTestId('set-row-0-3')).toBeInTheDocument()
    expect(useSessionStore.getState().exercises[0].sets).toHaveLength(4)
    expect(useSessionStore.getState().exercises[1].sets).toHaveLength(2)
  })

  it('redirects Home when there is no active session (deep link without starting)', () => {
    // store is idle after reset — no startFromPrescription call
    renderAtWorkout()

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.queryByText('Squat')).not.toBeInTheDocument()
  })
})
