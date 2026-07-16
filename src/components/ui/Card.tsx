import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type CardProps = HTMLAttributes<HTMLDivElement>

/** Surface card: the base container for exercise blocks, stat tiles, and
 *  other grouped content. Rounded, bordered, no heavy shadow. */
export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-2xl border border-border bg-surface p-5', className)}
      {...props}
    />
  )
}
