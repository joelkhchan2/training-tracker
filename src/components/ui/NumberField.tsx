import { useEffect, useId, useState } from 'react'
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
  hideSteppers?: boolean
  /** Additive: merged onto the input's own text-size/weight classes (default
   *  `text-3xl font-bold`). Lets one caller (the workout SetRow) request a
   *  smaller size without shrinking the number on the other five screens
   *  that share this component. */
  inputClassName?: string
}

// A *complete* number: digits, an optional leading '-', an optional '.digits'
// tail. Partial in-progress states ('', '-', '.', '102.') deliberately do NOT
// match, so they update the buffer without committing.
const COMPLETE_NUMBER = /^-?\d+(\.\d+)?$/

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
 *  tapping. Controlled — the caller owns `value` and receives numbers back.
 *
 *  The input renders an internal string `buffer`, not `value` directly, so
 *  the field can go transiently empty/partial ('', '-', '.', '102.') while
 *  typing. It commits (via the clamp/round path) only when the buffer is a
 *  *complete* number; a partial buffer never emits `NaN` and never gets
 *  silently reverted mid-edit. `focused` gates syncing the buffer from an
 *  external `value` change (prefill, stepper, reset) so that sync never
 *  clobbers an in-progress edit like "102." back to "102". */
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
  hideSteppers = false,
  inputClassName,
}: NumberFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  const [buffer, setBuffer] = useState(() => String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    // Can't derive this during render: `focused` is driven by DOM focus/blur
    // events, not a prop, so there's no render-time signal to diff against.
    // Controlled buffer must resync from an external `value` change
    // (prefill/stepper/reset) whenever the user isn't actively mid-edit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setBuffer(String(value))
  }, [value, focused])

  const commit = (next: number) => onChange(clamp(roundToStep(next), min, max))

  const handleTextChange = (raw: string) => {
    setBuffer(raw)
    if (!COMPLETE_NUMBER.test(raw)) return // partial — buffer-only, no commit
    commit(Number(raw))
  }

  const handleBlur = () => {
    setFocused(false)
    if (!COMPLETE_NUMBER.test(buffer)) {
      // Empty or partial ('-', '.', '102.') left on blur — never leave state NaN.
      commit(min)
      setBuffer(String(clamp(roundToStep(min), min, max)))
    } else {
      // Re-sync to the canonical (clamped/rounded) string in case the raw
      // buffer was outside [min,max] and the commit path adjusted it.
      setBuffer(String(clamp(roundToStep(Number(buffer)), min, max)))
    }
  }

  const stepperClasses = cn(
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface',
    'text-2xl font-semibold text-text transition-colors hover:bg-surface-hover',
    'disabled:opacity-40 disabled:pointer-events-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
  )

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-muted">
        {label}
      </label>
      <div className="flex min-w-0 items-stretch gap-2">
        {hideSteppers ? null : (
          <button
            type="button"
            aria-label={`Decrease ${label}`}
            onClick={() => commit(value - step)}
            disabled={disabled}
            className={stepperClasses}
          >
            &minus;
          </button>
        )}
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={buffer}
          placeholder="0"
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onChange={(event) => handleTextChange(event.target.value)}
          className={cn(
            'min-w-0 flex-1 rounded-xl border border-border bg-surface text-center',
            inputClassName ?? 'text-3xl font-bold',
            'tabular-nums text-text',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'disabled:opacity-40',
          )}
        />
        {hideSteppers ? null : (
          <button
            type="button"
            aria-label={`Increase ${label}`}
            onClick={() => commit(value + step)}
            disabled={disabled}
            className={stepperClasses}
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}
