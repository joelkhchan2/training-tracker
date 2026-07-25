import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProgressPage } from './ProgressPage'

const { usePersonalRecords } = vi.hoisted(() => ({ usePersonalRecords: vi.fn() }))

vi.mock('../../data/personalRecords', async () => {
  const actual = await vi.importActual<typeof import('../../data/personalRecords')>('../../data/personalRecords')
  return { ...actual, usePersonalRecords }
})

vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'user-1' },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}))

beforeEach(() => {
  usePersonalRecords.mockReset()
})

describe('ProgressPage', () => {
  it('renders Loading… while the query is loading', () => {
    usePersonalRecords.mockReturnValue({ data: undefined, isLoading: true })
    render(<ProgressPage />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders the empty-state message when there are no records', () => {
    usePersonalRecords.mockReturnValue({
      data: { strength: [], climbingMaxGrade: null },
      isLoading: false,
    })
    render(<ProgressPage />)
    expect(screen.getByText('Log some workouts to see your records here.')).toBeInTheDocument()
  })

  it('renders a strength record and the climbing max grade', () => {
    usePersonalRecords.mockReturnValue({
      data: {
        strength: [
          {
            exerciseId: 'ex-1',
            exerciseName: 'Back Squat',
            bestE1rm: 150,
            bestE1rmWeight: 130,
            bestE1rmReps: 5,
            bestVolume: 2600,
          },
        ],
        climbingMaxGrade: 6,
      },
      isLoading: false,
    })
    render(<ProgressPage />)
    expect(screen.getByText('Back Squat')).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === 'e1RM 150 · 130×5  ·  vol 2600')).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === 'max V6')).toBeInTheDocument()
  })
})
