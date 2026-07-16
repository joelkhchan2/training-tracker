import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'default' | 'sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretches the button to fill its container's width. */
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-hover',
  ghost: 'text-text hover:bg-surface',
  danger: 'bg-danger text-danger-fg hover:brightness-110 active:brightness-95',
}

// `sm` is still ≥44px tall (h-11 = 44px); `default` is the large,
// thumb-friendly size meant for primary workout-logging actions.
const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-12 px-5 text-base',
  sm: 'h-11 px-4 text-sm',
}

/** Base button primitive. Defaults to a large, high-contrast `primary`
 *  action sized for sweaty-hands mid-workout tapping. */
export function Button({
  variant = 'primary',
  size = 'default',
  fullWidth = false,
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-40 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  )
}
