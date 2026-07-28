import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NumberField, type NumberFieldProps } from './NumberField'

// A realistic controlled parent: echoes `onChange` back into `value`, the
// way every real caller (SetRow, sessionStore-backed forms) does. Bare
// `vi.fn()` callers never do this, so they can't exercise what the field
// displays after a commit — only whether/what onChange was called with.
//
// `{...props}` is spread AFTER `value`/`onChange` so a test can still force
// an explicit `value` prop (e.g. to simulate an EXTERNAL write, such as
// sessionStore's carry-forward, that bypasses this field's own onChange).
function Controlled({
  initial = 0,
  onChange,
  ...props
}: { initial?: number } & Partial<NumberFieldProps>) {
  const [v, setV] = useState(initial)
  return (
    <NumberField
      label="Weight"
      value={v}
      onChange={(next) => {
        setV(next)
        onChange?.(next)
      }}
      {...props}
    />
  )
}

describe('NumberField', () => {
  it('renders its label and current value', () => {
    render(<NumberField label="Weight" value={100} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Weight')).toHaveValue('100')
  })

  it('calls onChange with a number when the input changes', () => {
    const onChange = vi.fn()
    render(<NumberField label="Weight" value={100} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '135' } })
    expect(onChange).toHaveBeenCalledWith(135)
  })

  it('increments by step when the + stepper is clicked', () => {
    const onChange = vi.fn()
    render(<NumberField label="Weight" value={100} onChange={onChange} step={5} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase Weight' }))
    expect(onChange).toHaveBeenCalledWith(105)
  })

  it('decrements by step when the − stepper is clicked, clamped at min', () => {
    const onChange = vi.fn()
    render(<NumberField label="Reps" value={2} onChange={onChange} step={5} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Reps' }))
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('hides stepper buttons when hideSteppers is true, but input still works', () => {
    const onChange = vi.fn()
    render(<NumberField label="Weight" value={100} onChange={onChange} hideSteppers />)
    expect(screen.queryByLabelText('Increase Weight')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decrease Weight')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Weight')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '150' } })
    expect(onChange).toHaveBeenCalledWith(150)
  })

  // Regression guard: when used as a flex-1 field (e.g. two side-by-side in a
  // SetRow), the input's intrinsic ~20-char preferred width leaks up through
  // any flex ancestor left at min-width:auto, forcing horizontal overflow that
  // blows the whole page wider than the viewport. min-w-0 on BOTH wrapper divs
  // (not just the input) is what lets the field shrink. jsdom can't measure
  // layout, so we assert the load-bearing classes are present.
  it('keeps min-w-0 on both flex wrappers so the field can shrink', () => {
    render(<NumberField label="Weight" value={100} onChange={vi.fn()} hideSteppers />)
    const input = screen.getByLabelText('Weight')
    const inputRow = input.parentElement as HTMLElement
    const outerWrapper = inputRow.parentElement as HTMLElement
    expect(input).toHaveClass('min-w-0')
    expect(inputRow).toHaveClass('min-w-0')
    expect(outerWrapper).toHaveClass('min-w-0')
  })

  it('erasing to empty leaves the field empty and does not call onChange', () => {
    const onChange = vi.fn()
    render(<NumberField label="Reps" value={5} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '' } })
    expect(screen.getByLabelText('Reps')).toHaveValue('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows placeholder "0"', () => {
    render(<NumberField label="Reps" value={5} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Reps')).toHaveAttribute('placeholder', '0')
  })

  it('commits min on blur when the buffer is left empty', () => {
    const onChange = vi.fn()
    render(<Controlled label="Reps" initial={5} onChange={onChange} min={0} />)
    const input = screen.getByLabelText('Reps')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(0)
    expect(input).toHaveValue('0')
  })

  it('retyping a full replacement after clearing does not merge with the old value', () => {
    const onChange = vi.fn()
    render(<Controlled label="Reps" initial={5} onChange={onChange} />)
    const input = screen.getByLabelText('Reps')
    fireEvent.change(input, { target: { value: '' } }) // backspace the prefilled 5
    fireEvent.change(input, { target: { value: '1' } })
    fireEvent.change(input, { target: { value: '12' } })
    expect(input).toHaveValue('12')
    expect(onChange).toHaveBeenLastCalledWith(12)
  })

  // Regression guard for a bug a reviewer found: handleBlur's invalid/empty
  // branch used to skip `setFocused(false)`, so `focused` got stuck `true`
  // after any empty+blur. Consequence: the field would permanently show its
  // stale internal `buffer` and ignore all future EXTERNAL `value` prop
  // changes — reachable in real use via sessionStore.updateSet's
  // carry-forward, which writes a sibling set's weight/reps into this same
  // field's `value` prop while it isn't focused.
  it('shows a later external value change after an empty-blur commit (carry-forward)', () => {
    const { rerender } = render(<Controlled label="Reps" initial={5} min={0} />)
    const input = screen.getByLabelText('Reps')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input) // commits min, and must clear `focused`
    expect(input).toHaveValue('0')

    // External write that bypasses this field's own onChange — e.g. a
    // sibling set's carry-forward — with no refocus in between. The
    // `Controlled` wrapper's explicit `value` prop overrides its own
    // internal state (see the component's `{...props}` spread order above).
    rerender(<Controlled label="Reps" initial={5} min={0} value={42} />)
    expect(screen.getByLabelText('Reps')).toHaveValue('42')
  })

  it('typing a decimal digit-by-digit keeps the dot and only the complete number commits', () => {
    const onChange = vi.fn()
    render(<NumberField label="Distance" value={0} onChange={onChange} step={0.1} />)
    const input = screen.getByLabelText('Distance')
    fireEvent.change(input, { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith(1)
    fireEvent.change(input, { target: { value: '1.' } })
    expect(input).toHaveValue('1.') // dot preserved, not stripped mid-entry
    fireEvent.change(input, { target: { value: '1.5' } })
    expect(input).toHaveValue('1.5')
    expect(onChange).toHaveBeenLastCalledWith(1.5)
    expect(onChange).not.toHaveBeenCalledWith(15) // never garbled into "15"
  })

  it('an external value change while focused does not clobber the in-progress buffer', () => {
    const onChange = vi.fn()
    const { rerender } = render(<NumberField label="Distance" value={1} onChange={onChange} step={0.1} />)
    const input = screen.getByLabelText('Distance')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1.' } }) // partial, buffer-only
    rerender(<NumberField label="Distance" value={5} onChange={onChange} step={0.1} />) // external change
    expect(input).toHaveValue('1.') // still mid-edit, not clobbered to "5"
  })

  it('applies inputClassName to the input, replacing the default text-3xl when supplied', () => {
    const { rerender } = render(<NumberField label="Weight" value={100} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Weight')).toHaveClass('text-3xl', 'font-bold')

    rerender(<NumberField label="Weight" value={100} onChange={vi.fn()} inputClassName="text-xl font-bold" />)
    expect(screen.getByLabelText('Weight')).toHaveClass('text-xl', 'font-bold')
    expect(screen.getByLabelText('Weight')).not.toHaveClass('text-3xl')
  })
})
