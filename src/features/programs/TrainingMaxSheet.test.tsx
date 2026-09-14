import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrainingMaxSheet } from './TrainingMaxSheet'

const { mutate, useUpdateTrainingMaxes } = vi.hoisted(() => {
  const mutate = vi.fn()
  return { mutate, useUpdateTrainingMaxes: vi.fn(() => ({ mutate, isPending: false })) }
})

vi.mock('../../data/trainingMaxes', () => ({ useUpdateTrainingMaxes }))

beforeEach(() => {
  mutate.mockReset()
  useUpdateTrainingMaxes.mockReturnValue({ mutate, isPending: false })
})

describe('TrainingMaxSheet', () => {
  it('prefills a field per lift from the current maxes', () => {
    render(<TrainingMaxSheet keys={['squat', 'benchPress']} current={{ squat: 250, benchPress: 160 }} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Squat')).toHaveValue('250')
    expect(screen.getByLabelText('Bench Press')).toHaveValue('160')
  })

  it('disables Save until a value changes', () => {
    render(<TrainingMaxSheet keys={['squat']} current={{ squat: 250 }} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Squat'), { target: { value: '260' } })
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('writes only the changed lifts, carrying prev_value, then closes on success', () => {
    const onClose = vi.fn()
    render(<TrainingMaxSheet keys={['squat', 'benchPress']} current={{ squat: 250, benchPress: 160 }} onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Squat'), { target: { value: '265' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const [payload, options] = mutate.mock.calls[0]
    expect(payload).toEqual({ updates: [{ key: 'squat', value: 265, prevValue: 250 }] })

    options.onSuccess()
    expect(onClose).toHaveBeenCalled()
  })

  it('blocks saving when a changed lift is set to zero', () => {
    render(<TrainingMaxSheet keys={['squat']} current={{ squat: 250 }} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Squat'), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('treats a lift with no max on file as 0 and carries prevValue null when first set', () => {
    render(<TrainingMaxSheet keys={['squat']} current={{}} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Squat')).toHaveValue('0')
    fireEvent.change(screen.getByLabelText('Squat'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate.mock.calls[0][0]).toEqual({ updates: [{ key: 'squat', value: 200, prevValue: null }] })
  })
})
