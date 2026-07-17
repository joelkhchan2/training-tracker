import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProgramsPage } from './ProgramsPage'
import { PRESETS } from '../../domain/presets'
import type { ActiveWorkoutBundle } from '../../data/queries'
import { fiveThreeOne } from '../../domain'

const { useActiveWorkout } = vi.hoisted(() => ({ useActiveWorkout: vi.fn() }))

vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'user-1' },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('../../data/queries', () => ({ useActiveWorkout }))

const bundleWithActiveProgram: ActiveWorkoutBundle = {
  program: fiveThreeOne,
  days: [],
  programExercises: [],
  exercisesById: {},
  trainingMaxes: {},
  cursor: { dayIndex: 0, week: 1, cycle: 1 },
  personalRecords: [],
}

describe('ProgramsPage', () => {
  beforeEach(() => {
    useActiveWorkout.mockReset()
    useActiveWorkout.mockReturnValue({ data: null, isLoading: false })
  })

  it('lists all presets', () => {
    render(<ProgramsPage />)

    for (const preset of PRESETS) {
      expect(screen.getByText(preset.name)).toBeInTheDocument()
    }
  })

  it('shows a preview with the days and exercises of the selected preset', () => {
    render(<ProgramsPage />)

    fireEvent.click(screen.getByText('Push/Pull/Legs'))

    const pushPullLegs = PRESETS.find(p => p.id === 'pushPullLegs')!
    for (const day of pushPullLegs.program.days) {
      expect(screen.getByText(day.name)).toBeInTheDocument()
      for (const ex of day.exercises) {
        expect(screen.getByText(ex.exerciseName)).toBeInTheDocument()
      }
    }
    expect(screen.getByRole('button', { name: 'Use this program' })).toBeInTheDocument()
  })

  it('shows a Current badge on the active program\'s card', () => {
    useActiveWorkout.mockReturnValue({ data: bundleWithActiveProgram, isLoading: false })

    render(<ProgramsPage />)

    const fiveThreeOneCard = screen.getByText('5/3/1').closest('[role="button"]')
    expect(fiveThreeOneCard).not.toBeNull()
    expect(within(fiveThreeOneCard as HTMLElement).getByText('Current')).toBeInTheDocument()

    const strongLiftsCard = screen.getByText('StrongLifts 5x5').closest('[role="button"]')
    expect(within(strongLiftsCard as HTMLElement).queryByText('Current')).not.toBeInTheDocument()
  })

  it('fires onUse with the selected preset when "Use this program" is tapped', () => {
    const onUse = vi.fn()
    render(<ProgramsPage onUse={onUse} />)

    fireEvent.click(screen.getByText('Beginner Linear Progression'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }))

    const beginnerLinear = PRESETS.find(p => p.id === 'beginnerLinear')!
    expect(onUse).toHaveBeenCalledWith(beginnerLinear)
  })
})
