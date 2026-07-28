import { useId, useState } from 'react'
import { cn } from '../../lib/cn'
import { formatDuration, parseDurationInput } from '../../domain/duration'

export interface DurationFieldProps {
  label: string
  /** null = nothing entered yet — a valid, meaningful state, unlike NumberField's
   *  clamped-minimum-on-blur behavior. */
  valueSeconds: number | null
  onChange: (seconds: number | null) => void
  disabled?: boolean
  className?: string
  id?: string
  /** Optional override for the input's text-size/weight classes, mirroring
   *  NumberField's inputClassName (used by SetRow's compact layout). */
  inputClassName?: string
}

/** mm:ss duration entry, following NumberField's controlled-buffer pattern (the buffer
 *  is the source of truth while focused) but diverging where duration's semantics
 *  differ: no steppers (typing/pasting is the primary input), and an emptied buffer
 *  commits `null` immediately instead of clamping to a minimum. See
 *  src/domain/duration.ts for the exact parse/format rules this defers to. */
export function DurationField({
  label,
  valueSeconds,
  onChange,
  disabled = false,
  className,
  id,
  inputClassName,
}: DurationFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  const externalDisplay = valueSeconds != null ? formatDuration(valueSeconds) : ''
  const [buffer, setBuffer] = useState(externalDisplay)
  const [focused, setFocused] = useState(false)

  // While focused, the buffer is the source of truth so a transient '1:' can be shown
  // without being clobbered; once unfocused, the prop (reformatted) is shown directly.
  const display = focused ? buffer : externalDisplay

  const handleFocus = () => {
    setBuffer(externalDisplay)
    setFocused(true)
  }

  const handleTextChange = (raw: string) => {
    setBuffer(raw)
    setFocused(true)
    if (raw === '') {
      onChange(null) // erasable — empty is a valid, meaningful committed state
      return
    }
    const parsed = parseDurationInput(raw)
    if (parsed == null) return // invalid/in-progress (e.g. "1:") — buffer-only, no commit
    onChange(parsed)
  }

  const handleBlur = () => {
    setFocused(false)
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="text"
        value={display}
        placeholder="0:00"
        disabled={disabled}
        onFocus={handleFocus}
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
    </div>
  )
}
