import { useId } from 'react'
import { cn } from '../../lib/cn'

export interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string
  className?: string
  id?: string
}

/** Single-line text input for short free-text entry (program/exercise names).
 *  Controlled — the caller owns `value` and receives strings back. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  error,
  className,
  id,
}: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-12 w-full rounded-xl border border-border bg-surface px-4',
          'text-base text-text placeholder:text-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        )}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
