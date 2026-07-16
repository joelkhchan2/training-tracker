import { useId } from 'react'
import { cn } from '../../lib/cn'

export interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  id?: string
}

function clamp(value: number, min: number, max?: number): number {
  let next = Math.max(min, value)
  if (typeof max === 'number') next = Math.min(max, next)
  return next
}

// Rounds away floating-point noise from repeated +/- taps (e.g. 0.1 + 0.2)
// without imposing a fixed decimal precision on the caller's step size.
function roundToStep(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Large numeric input for weight/reps entry mid-workout: big legible text,
 *  a mobile decimal keyboard, and +/- steppers sized for sweaty-hands
 *  tapping. Controlled — the caller owns `value` and receives numbers back. */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled = false,
  className,
  id,
}: NumberFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  const commit = (next: number) => onChange(clamp(roundToStep(next), min, max))

  const handleTextChange = (raw: string) => {
    // Allow the field to be transiently empty/partial while typing without
    // forcing it back to a number on every keystroke.
    if (raw === '' || raw === '-' || raw === '.') return
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    commit(parsed)
  }

  const stepperClasses = cn(
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface',
    'text-2xl font-semibold text-text transition-colors hover:bg-surface-hover',
    'disabled:opacity-40 disabled:pointer-events-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-muted">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => commit(value - step)}
          disabled={disabled}
          className={stepperClasses}
        >
          &minus;
        </button>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(event) => handleTextChange(event.target.value)}
          className={cn(
            'min-w-0 flex-1 rounded-xl border border-border bg-surface text-center',
            'text-3xl font-bold tabular-nums text-text',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'disabled:opacity-40',
          )}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => commit(value + step)}
          disabled={disabled}
          className={stepperClasses}
        >
          +
        </button>
      </div>
    </div>
  )
}
