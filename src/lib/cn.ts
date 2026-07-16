import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Combines conditional class names via `clsx`, then resolves conflicting
 *  Tailwind utility classes (e.g. a caller-supplied `px-6` overriding a
 *  component's default `px-4`) via `tailwind-merge`. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
