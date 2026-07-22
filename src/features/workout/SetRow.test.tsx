import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SetRow } from './SetRow'

const baseSet = { weight: null, reps: 8, done: false }

describe('SetRow', () => {
  it('shows the Weight field by default', () => {
    render(<SetRow exIdx={0} setIdx={0} set={baseSet} />)
    expect(screen.getByLabelText('Weight')).toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()
  })
  it('hides the Weight field when hideWeight is set', () => {
    render(<SetRow exIdx={0} setIdx={0} set={baseSet} hideWeight />)
    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()
  })
})
