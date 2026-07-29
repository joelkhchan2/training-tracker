import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ProgressPage } from './ProgressPage'
import { usePrefs } from '../settings/usePrefs'

const { usePersonalRecords } = vi.hoisted(() => ({ usePersonalRecords: vi.fn() }))
const { nav } = vi.hoisted(() => ({ nav: vi.fn() }))

vi.mock('../../data/personalRecords', async () => {
  const actual = await vi.importActual<typeof import('../../data/personalRecords')>('../../data/personalRecords')
  return { ...actual, usePersonalRecords }
})

vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))

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
  nav.mockReset()
})

describe('ProgressPage', () => {
  it('renders Loading… while the query is loading', () => {
    usePersonalRecords.mockReturnValue({ data: undefined, isLoading: true })
    render(<ProgressPage />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders the empty-state message when there are no records (including no cardio)', () => {
    usePersonalRecords.mockReturnValue({
      data: { strength: [], climbingMaxGrade: null, cardio: [] },
      isLoading: false,
    })
    render(<ProgressPage />)
    expect(screen.getByText('Log some workouts to see your records here.')).toBeInTheDocument()
  })

  it('does not show the empty state when only cardio records exist', () => {
    usePersonalRecords.mockReturnValue({
      data: {
        strength: [],
        climbingMaxGrade: null,
        cardio: [{ activity: 'Run', bestDistanceKm: 5, bestDurationMinutes: 30, bestPaceDurationMinutes: null, bestPaceDistanceKm: null }],
      },
      isLoading: false,
    })
    render(<ProgressPage />)
    expect(screen.queryByText('Log some workouts to see your records here.')).not.toBeInTheDocument()
    expect(screen.getByText('Run')).toBeInTheDocument()
  })

  it('renders a CardioRecordCard with the full detail line and omits unset segments', () => {
    usePersonalRecords.mockReturnValue({
      data: {
        strength: [],
        climbingMaxGrade: null,
        cardio: [
          { activity: 'Run', bestDistanceKm: 10, bestDurationMinutes: 60, bestPaceDurationMinutes: 20, bestPaceDistanceKm: 5 },
          { activity: 'Row', bestDistanceKm: 0, bestDurationMinutes: 45, bestPaceDurationMinutes: null, bestPaceDistanceKm: null },
        ],
      },
      isLoading: false,
    })
    render(<ProgressPage />)
    expect(screen.getByText('Cardio')).toBeInTheDocument()
    expect(screen.getByText('Run')).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === '10 km  ·  4:00 /km  ·  60 min')).toBeInTheDocument()
    expect(screen.getByText('Row')).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === '45 min')).toBeInTheDocument()
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

  it('renders a timed "hold" PR segment', () => {
    usePersonalRecords.mockReturnValue({
      data: {
        strength: [
          {
            exerciseId: 'ex-2',
            exerciseName: 'Front Lever Progression',
            bestE1rm: 0,
            bestE1rmWeight: null,
            bestE1rmReps: null,
            bestVolume: 0,
            bestDuration: 12,
            bestDurationWeight: null,
          },
        ],
        climbingMaxGrade: null,
      },
      isLoading: false,
    })
    render(<ProgressPage />)
    expect(screen.getByText((_, el) => el?.textContent === 'hold 0:12')).toBeInTheDocument()
  })

  it('joins the hold segment after e1RM/volume when all three are present, with weight when bestDurationWeight is set', () => {
    usePersonalRecords.mockReturnValue({
      data: {
        strength: [
          {
            exerciseId: 'ex-3',
            exerciseName: 'Weighted Dead Hang',
            bestE1rm: 150,
            bestE1rmWeight: 130,
            bestE1rmReps: 5,
            bestVolume: 2600,
            bestDuration: 30,
            bestDurationWeight: 25,
          },
        ],
        climbingMaxGrade: null,
      },
      isLoading: false,
    })
    render(<ProgressPage />)
    expect(screen.getByText((_, el) => el?.textContent === 'e1RM 150 · 130×5  ·  vol 2600  ·  hold 0:30 · 25')).toBeInTheDocument()
  })

  it('renders the 1RM Calculator entry in the Tools section even with no records', () => {
    usePersonalRecords.mockReturnValue({
      data: { strength: [], climbingMaxGrade: null },
      isLoading: false,
    })
    render(<ProgressPage />)
    expect(screen.getByText('1RM Calculator')).toBeInTheDocument()
  })

  it('navigates to /progress/calculator when the 1RM Calculator entry is clicked', () => {
    usePersonalRecords.mockReturnValue({
      data: { strength: [], climbingMaxGrade: null },
      isLoading: false,
    })
    render(<ProgressPage />)
    fireEvent.click(screen.getByText('1RM Calculator'))
    expect(nav).toHaveBeenCalledWith('/progress/calculator')
  })

  it('renders the Tools section before the Personal records section', () => {
    usePersonalRecords.mockReturnValue({
      data: { strength: [], climbingMaxGrade: null },
      isLoading: false,
    })
    render(<ProgressPage />)
    const toolsHeading = screen.getByText('Tools')
    const recordsHeading = screen.getByText('Personal records')
    expect(toolsHeading.compareDocumentPosition(recordsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('ProgressPage — kg mode', () => {
  afterEach(() => usePrefs.setState({ weightUnit: 'lb' }))

  it('converts e1RM, e1RM weight, volume, and hold weight (with kg suffix)', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    usePersonalRecords.mockReturnValue({
      data: {
        strength: [
          {
            exerciseId: 'ex-3', exerciseName: 'Weighted Dead Hang',
            bestE1rm: 150, bestE1rmWeight: 130, bestE1rmReps: 5, bestVolume: 2600,
            bestDuration: 30, bestDurationWeight: 25,
          },
        ],
        climbingMaxGrade: null,
      },
      isLoading: false,
    })
    render(<ProgressPage />)
    // 150->68 kg, 130->59 kg, 2600->1179.3 kg, 25->11.3 kg
    expect(
      screen.getByText((_, el) => el?.textContent === 'e1RM 68 kg · 59 kg×5  ·  vol 1179.3 kg  ·  hold 0:30 · 11.3 kg'),
    ).toBeInTheDocument()
  })
})

describe('ProgressPage — search/filter/sort', () => {
  const RECORDS = [
    { exerciseId: 'ex-1', exerciseName: 'Zercher Squat', bestE1rm: 150, bestE1rmWeight: 130, bestE1rmReps: 5, bestVolume: 500, movementPattern: 'hinge' },
    { exerciseId: 'ex-2', exerciseName: 'Bench Press', bestE1rm: 100, bestE1rmWeight: 90, bestE1rmReps: 5, bestVolume: 1200, movementPattern: 'push' },
    { exerciseId: 'ex-3', exerciseName: 'Ab Wheel', bestE1rm: 50, bestE1rmWeight: 0, bestE1rmReps: null, bestVolume: 3000, movementPattern: null },
  ]

  function namesInOrder() {
    return screen.getAllByText(/^(Ab Wheel|Bench Press|Zercher Squat)$/).map(el => el.textContent)
  }

  beforeEach(() => {
    usePersonalRecords.mockReturnValue({
      data: {
        strength: RECORDS,
        climbingMaxGrade: 6,
        cardio: [{ activity: 'Run', bestDistanceKm: 5, bestDurationMinutes: 30, bestPaceDurationMinutes: null, bestPaceDistanceKm: null }],
      },
      isLoading: false,
    })
  })

  it('defaults to e1RM-descending order', () => {
    render(<ProgressPage />)
    expect(namesInOrder()).toEqual(['Zercher Squat', 'Bench Press', 'Ab Wheel'])
  })

  it('filters records by the search input', () => {
    render(<ProgressPage />)
    fireEvent.change(screen.getByLabelText('Search records'), { target: { value: 'bench' } })
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.queryByText('Zercher Squat')).not.toBeInTheDocument()
    expect(screen.queryByText('Ab Wheel')).not.toBeInTheDocument()
  })

  it('shows "No matching records." when the search matches nothing', () => {
    render(<ProgressPage />)
    fireEvent.change(screen.getByLabelText('Search records'), { target: { value: 'nonexistent' } })
    expect(screen.getByText('No matching records.')).toBeInTheDocument()
  })

  it('narrows the list with the movement-pattern filter', () => {
    render(<ProgressPage />)
    fireEvent.change(screen.getByLabelText('Filter by movement'), { target: { value: 'push' } })
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.queryByText('Zercher Squat')).not.toBeInTheDocument()
    expect(screen.queryByText('Ab Wheel')).not.toBeInTheDocument()
  })

  it('hides the climbing and cardio cards once a search or movement filter is active', () => {
    render(<ProgressPage />)
    expect(screen.getByText('Climbing')).toBeInTheDocument()
    expect(screen.getByText('Cardio')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search records'), { target: { value: 'bench' } })
    expect(screen.queryByText('Climbing')).not.toBeInTheDocument()
    expect(screen.queryByText('Cardio')).not.toBeInTheDocument()
  })

  it('reorders the list when sorting by Volume', () => {
    render(<ProgressPage />)
    fireEvent.change(screen.getByLabelText('Sort records'), { target: { value: 'volume' } })
    expect(namesInOrder()).toEqual(['Ab Wheel', 'Bench Press', 'Zercher Squat'])
  })

  it('reorders the list when sorting by Name A–Z', () => {
    render(<ProgressPage />)
    fireEvent.change(screen.getByLabelText('Sort records'), { target: { value: 'name' } })
    expect(namesInOrder()).toEqual(['Ab Wheel', 'Bench Press', 'Zercher Squat'])
  })
})
