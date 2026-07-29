import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProgramPreview } from './ProgramPreview'
import type { PreviewProgram } from './ProgramPreview'
import { PRESETS, pushPullLegs } from '../../domain/presets'
import type { Scheme } from '../../domain/types'

const pushPullLegsPreset = PRESETS.find(p => p.id === 'pushPullLegs')!

const dbProgram: PreviewProgram = {
  name: 'My Custom Program',
  description: 'A DB-authored program.',
  discipline: 'strength',
  daysPerWeek: pushPullLegs.days.length,
  program: pushPullLegs,
}

describe('ProgramPreview', () => {
  it('renders a preset\'s days and exercises with a scheme summary, and no Edit action', () => {
    render(<ProgramPreview program={pushPullLegsPreset} onUse={vi.fn()} />)

    for (const day of pushPullLegsPreset.program.days) {
      expect(screen.getByText(day.name)).toBeInTheDocument()
      for (const ex of day.exercises) {
        expect(screen.getByText(ex.exerciseName)).toBeInTheDocument()
      }
    }
    expect(screen.getByRole('button', { name: 'Use this program' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('fires onUse when "Use this program" is tapped', () => {
    const onUse = vi.fn()
    render(<ProgramPreview program={pushPullLegsPreset} onUse={onUse} />)

    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }))

    expect(onUse).toHaveBeenCalledTimes(1)
  })

  it('renders a DB program\'s days and exercises the same way as a preset', () => {
    render(<ProgramPreview program={dbProgram} onUse={vi.fn()} />)

    for (const day of dbProgram.program.days) {
      expect(screen.getByText(day.name)).toBeInTheDocument()
      for (const ex of day.exercises) {
        expect(screen.getByText(ex.exerciseName)).toBeInTheDocument()
      }
    }
  })

  it('renders a timed scheme summary as "count × m:ss"', () => {
    const timedProgram: PreviewProgram = {
      name: 'Front Lever',
      description: '',
      discipline: 'strength',
      daysPerWeek: 1,
      program: {
        name: 'Front Lever',
        discipline: 'strength',
        days: [
          {
            name: 'Day A',
            exercises: [
              {
                exerciseName: 'Front Lever Progression',
                order: 0,
                scheme: { type: 'timed', sets: [{ seconds: 8 }, { seconds: 8 }, { seconds: 8 }, { seconds: 8 }] },
              },
            ],
          },
        ],
      },
    }

    render(<ProgramPreview program={timedProgram} onUse={vi.fn()} />)

    expect(screen.getByText('4 × 0:08')).toBeInTheDocument()
  })

  it('shows Edit only when onEdit is supplied (i.e. the viewer owns the program)', () => {
    const onEdit = vi.fn()
    const { rerender } = render(<ProgramPreview program={dbProgram} onUse={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()

    rerender(<ProgramPreview program={dbProgram} onUse={vi.fn()} onEdit={onEdit} />)
    const editButton = screen.getByRole('button', { name: 'Edit' })
    expect(editButton).toBeInTheDocument()

    fireEvent.click(editButton)
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('does not crash when an exercise has a malformed scheme (bad DB data)', () => {
    // Reproduces the real crash: a jsonb scheme with an unknown type whose `sets`
    // is a number (not an array) made `formatScheme`'s `for..of` throw, white-screening
    // the whole preview. Also covers a scheme with no `sets` field at all.
    const malformed: PreviewProgram = {
      name: 'Malformed',
      description: '',
      discipline: 'strength',
      daysPerWeek: 1,
      program: {
        name: 'Malformed',
        discipline: 'strength',
        days: [
          {
            name: 'Gym B',
            exercises: [
              { exerciseName: 'Tempo Squat', order: 0, scheme: { type: 'percentage_flat', sets: 4 } as unknown as Scheme },
              { exerciseName: 'Mystery Move', order: 1, scheme: { type: 'weird' } as unknown as Scheme },
            ],
          },
        ],
      },
    }

    expect(() => render(<ProgramPreview program={malformed} onUse={vi.fn()} />)).not.toThrow()
    expect(screen.getByText('Tempo Squat')).toBeInTheDocument()
    expect(screen.getByText('Mystery Move')).toBeInTheDocument()
  })
})
