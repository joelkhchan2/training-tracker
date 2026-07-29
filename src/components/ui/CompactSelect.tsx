import { cn } from '../../lib/cn'

export interface CompactSelectOption {
  value: string
  label: string
}

export interface CompactSelectProps {
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  options: CompactSelectOption[]
  className?: string
}

/** A compact, borderless native `<select>` for a rarely-changed override (e.g.
 *  ExerciseCard's "Log as" input type) that shouldn't occupy a full labeled `Select`.
 *  Deliberately a plain native select, not a hand-rolled ARIA-menu widget: it "only drops
 *  down on tap" and gives keyboard navigation, focus management, and the native mobile
 *  picker for free, with no bespoke open/close, outside-tap, Escape, or `role="menu"`
 *  keyboard semantics to build or maintain. `aria-label` (not a visible `<label>`) is the
 *  only accessible name — callers needing a labeled, bordered select should use `Select`
 *  instead. */
export function CompactSelect({ ariaLabel, value, onChange, options, className }: CompactSelectProps) {
  return (
    <span className={cn('relative inline-block', className)}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'w-full cursor-pointer appearance-none rounded bg-transparent py-0.5 pl-0 pr-4',
          'text-sm text-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-xs text-muted">
        ▾
      </span>
    </span>
  )
}
