import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SessionDetailPage } from './SessionDetailPage'
import { usePrefs } from '../settings/usePrefs'

const { useSessionDetail } = vi.hoisted(() => ({ useSessionDetail: vi.fn() }))
const { useDeleteSession } = vi.hoisted(() => ({ useDeleteSession: vi.fn() }))
const nav = vi.fn()

vi.mock('../../data/sessionDetail', async () => {
  const actual = await vi.importActual<typeof import('../../data/sessionDetail')>('../../data/sessionDetail')
  return { ...actual, useSessionDetail }
})
vi.mock('../../data/sessionHistory', () => ({ useDeleteSession }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => nav,
  useParams: () => ({ sessionId: 's1' }),
}))

const mutate = vi.fn()

const header = {
  discipline: 'strength' as const,
  date: '2026-07-20',
  sessionType: null,
  programVariant: null,
  programWeek: null,
  durationMinutes: null,
  bodyWeight: null,
  notes: null,
}

beforeEach(() => {
  mutate.mockReset()
  nav.mockReset()
  useSessionDetail.mockReset()
  useDeleteSession.mockReturnValue({ mutate, isPending: false })
})

describe('SessionDetailPage', () => {
  it('renders Loading… while the query is loading', () => {
    useSessionDetail.mockReturnValue({ data: undefined, isLoading: true })
    render(<SessionDetailPage />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders Session not found when data is null', () => {
    useSessionDetail.mockReturnValue({ data: null, isLoading: false })
    render(<SessionDetailPage />)
    expect(screen.getByText('Session not found.')).toBeInTheDocument()
  })

  it('renders a strength detail with exercise names, formatSet lines, and the no-delete note; no Delete button', () => {
    useSessionDetail.mockReturnValue({
      data: {
        kind: 'strength',
        header,
        exercises: [
          {
            exerciseName: 'Back Squat',
            sets: [
              { weight: 100, reps: 5, rpe: 8, isWarmup: false },
              { weight: 40, reps: 10, rpe: null, isWarmup: true },
            ],
          },
        ],
      },
      isLoading: false,
    })
    render(<SessionDetailPage />)
    expect(screen.getByText('Back Squat')).toBeInTheDocument()
    expect(screen.getByText('Set 1')).toBeInTheDocument()
    expect(screen.getByText('100×5 @8')).toBeInTheDocument()
    expect(screen.getByText('Set 2')).toBeInTheDocument()
    expect(screen.getByText('40×10')).toBeInTheDocument()
    expect(screen.getByText('Warm-up')).toBeInTheDocument()
    expect(screen.getByText("Strength sessions can't be deleted yet.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete session/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(document.querySelector('input')).not.toBeInTheDocument()
    expect(document.querySelector('button[aria-label*="Remove"]')).not.toBeInTheDocument()
  })

  it('renders a mixed weighted/timed/weighted_time set list in one exercise group, in order', () => {
    useSessionDetail.mockReturnValue({
      data: {
        kind: 'strength',
        header,
        exercises: [
          {
            exerciseName: 'Front Lever Practice',
            sets: [
              { weight: 100, reps: 5, rpe: null, isWarmup: false, durationSeconds: null },
              { weight: null, reps: null, rpe: null, isWarmup: false, durationSeconds: 45 },
              { weight: 25, reps: null, rpe: null, isWarmup: false, durationSeconds: 30 },
            ],
          },
        ],
      },
      isLoading: false,
    })
    render(<SessionDetailPage />)
    expect(screen.getByText('100×5')).toBeInTheDocument()
    expect(screen.getByText('0:45')).toBeInTheDocument()
    expect(screen.getByText('25 × 0:30')).toBeInTheDocument()
  })

  it('renders a cardio detail with activity + Delete button; confirming delete calls mutate and navigates on success', () => {
    useSessionDetail.mockReturnValue({
      data: {
        kind: 'cardio',
        header,
        activity: 'Run',
        distanceKm: 5,
        durationMinutes: 30,
        pace: '6:00',
      },
      isLoading: false,
    })
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    mutate.mockImplementation((_id, opts) => {
      opts.onSuccess()
    })
    render(<SessionDetailPage />)
    expect(screen.getByText('Run')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0]).toBe('s1')
    expect(nav).toHaveBeenCalledWith('/history')
    vi.unstubAllGlobals()
  })

  it('renders a climbing detail with sent/tried lines and total sends + attempts', () => {
    useSessionDetail.mockReturnValue({
      data: {
        kind: 'climbing',
        header: { discipline: 'climbing', date: '2026-07-27', sessionType: null, programVariant: null, programWeek: null, durationMinutes: null, bodyWeight: null, notes: null },
        sends: [{ grade: 'V5', count: 2, attempts: 8 }, { grade: 'V3', count: 1, attempts: 1 }],
        totalSends: 3,
        totalAttempts: 9,
      },
      isLoading: false,
    })
    render(<SessionDetailPage />)
    expect(screen.getByText('V5 · 2 sent / 8 tried')).toBeInTheDocument()
    expect(screen.getByText(/3 sends · 9 attempts/)).toBeInTheDocument()
  })
})

describe('SessionDetailPage — kg mode', () => {
  afterEach(() => usePrefs.setState({ weightUnit: 'lb' }))

  it('converts weights in formatSet lines and the header BW', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    useSessionDetail.mockReturnValue({
      data: {
        kind: 'strength',
        header: { ...header, bodyWeight: 200 },
        exercises: [{ exerciseName: 'Back Squat', sets: [{ weight: 100, reps: 5, rpe: null, isWarmup: false, durationSeconds: null }] }],
      },
      isLoading: false,
    })
    render(<SessionDetailPage />)
    expect(screen.getByText('45.4 kg×5')).toBeInTheDocument()
    expect(screen.getByText(/BW 90.7 kg/)).toBeInTheDocument() // 200 lb -> 90.7 kg
  })
})
