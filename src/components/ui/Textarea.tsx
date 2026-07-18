import { useId } from 'react'
import { cn } from '../../lib/cn'

export interface TextareaProps {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  className?: string
  id?: string
}

/** Multi-line text input for longer free-text entry (notes, descriptions).
 *  Controlled — the caller owns `value` and receives strings back. */
export function Textarea({ label, value, onChange, rows = 4, className, id }: TextareaProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-muted">
        {label}
      </label>
      <textarea
        id={inputId}
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'w-full resize-y rounded-xl border border-border bg-surface px-4 py-3',
          'text-base text-text placeholder:text-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        )}
      />
    </div>
  )
}
