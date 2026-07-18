import { useId } from 'react'
import { cn } from '../../lib/cn'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
  id?: string
}

/** Single-choice dropdown for a fixed set of options (goal, day type, etc).
 *  Controlled — the caller owns `value` and receives strings back. */
export function Select({ label, value, onChange, options, className, id }: SelectProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-muted">
        {label}
      </label>
      <select
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-12 w-full rounded-xl border border-border bg-surface px-4',
          'text-base text-text',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
