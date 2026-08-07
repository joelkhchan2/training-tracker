import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EditProgramDetailsSheet } from './EditProgramDetailsSheet'

const { useUpdateProgramDetails, mockMutate } = vi.hoisted(() => ({
  useUpdateProgramDetails: vi.fn(),
  mockMutate: vi.fn(),
}))

vi.mock('../../data/saveProgram', () => ({ useUpdateProgramDetails }))

beforeEach(() => {
  mockMutate.mockReset()
  useUpdateProgramDetails.mockReturnValue({ mutate: mockMutate, isPending: false })
})

describe('EditProgramDetailsSheet', () => {
  it('prefills name/description and saves the edited values, closing on success', () => {
    const onClose = vi.fn()
    mockMutate.mockImplementation((_input, opts) => opts.onSuccess())
    render(
      <EditProgramDetailsSheet
        programId="p1"
        initialName="Old Name"
        initialDescription="Old description"
        onClose={onClose}
      />,
    )

    expect(screen.getByLabelText('Program name')).toHaveValue('Old Name')
    expect(screen.getByLabelText('Description')).toHaveValue('Old description')

    fireEvent.change(screen.getByLabelText('Program name'), { target: { value: 'New Name' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New description' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockMutate).toHaveBeenCalledWith(
      { programId: 'p1', name: 'New Name', description: 'New description' },
      expect.anything(),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('blocks saving an empty name', () => {
    render(
      <EditProgramDetailsSheet programId="p1" initialName="Name" initialDescription="" onClose={vi.fn()} />,
    )

    fireEvent.change(screen.getByLabelText('Program name'), { target: { value: '   ' } })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('surfaces a save error and keeps the sheet open', () => {
    const onClose = vi.fn()
    mockMutate.mockImplementation((_input, opts) => opts.onError(new Error('nope')))
    render(
      <EditProgramDetailsSheet programId="p1" initialName="Name" initialDescription="" onClose={onClose} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('nope')
    expect(onClose).not.toHaveBeenCalled()
  })
})
