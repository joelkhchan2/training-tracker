import { useId } from 'react'
import { NumberField } from './NumberField'
import { cn } from '../../lib/cn'
import { usePrefs } from '../../features/settings/usePrefs'
import { fromDisplayWeight, toDisplayWeight, type WeightUnit } from '../../domain/weight'

interface WeightFieldCommon {
  /** e.g. "Weight" — becomes "Weight (kg)" in kg mode. */
  label: string
  stepLb?: number
  /** lb-space bounds; converted to display units internally. */
  min?: number
  max?: number
  hideSteppers?: boolean
  inputClassName?: string
  disabled?: boolean
  className?: string
  id?: string
  /** Only wired into the nullable variant's input (NumberField owns its own placeholder). */
  placeholder?: string
}

export type WeightFieldProps =
  | (WeightFieldCommon & { nullable?: false; valueLb: number; onChangeLb: (lb: number) => void })
  | (WeightFieldCommon & { nullable: true; valueLb: number | null; onChangeLb: (lb: number | null) => void })

/** A weight-aware wrapper over NumberField. Reads `weightUnit` from usePrefs and converts the
 *  value/step/min/max to the display unit on the way in and back to lb (canonical) on the way out.
 *  The nullable variant (body weight) renders its own controlled input because NumberField cannot
 *  represent a persistently empty value. */
export function WeightField(props: WeightFieldProps) {
  const unit: WeightUnit = usePrefs((s) => s.weightUnit)
  const autoId = useId()
  const label = unit === 'kg' ? `${props.label} (kg)` : props.label

  if (props.nullable) {
    const inputId = props.id ?? autoId
    const displayValue = props.valueLb == null ? '' : String(toDisplayWeight(props.valueLb, unit))
    return (
      <div className={cn('flex flex-col gap-2', props.className)}>
        <label htmlFor={inputId} className="text-sm font-medium text-muted">
          {label}
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          value={displayValue}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(e) =>
            props.onChangeLb(e.target.value === '' ? null : fromDisplayWeight(Number(e.target.value), unit))
          }
          className={cn(
            'h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-text',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            props.inputClassName,
          )}
        />
      </div>
    )
  }

  const { valueLb, onChangeLb, stepLb = 1, min, max, hideSteppers, inputClassName, disabled, className, id } = props
  return (
    <NumberField
      label={label}
      value={toDisplayWeight(valueLb, unit)}
      onChange={(displayValue) => onChangeLb(fromDisplayWeight(displayValue, unit))}
      step={toDisplayWeight(stepLb, unit)}
      min={min != null ? toDisplayWeight(min, unit) : undefined}
      max={max != null ? toDisplayWeight(max, unit) : undefined}
      hideSteppers={hideSteppers}
      inputClassName={inputClassName}
      disabled={disabled}
      className={className}
      id={id}
    />
  )
}
