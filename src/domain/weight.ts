import { round1 } from './oneRepMax'

export type WeightUnit = 'lb' | 'kg'

/** Exact international avoirdupois pound → kilogram factor. */
export const LB_PER_KG = 0.45359237

/** lb → display unit. Identity in 'lb' (no rounding drift into today's raw-number display);
 *  round1-quantized in 'kg'. Non-finite input → 0. */
export function toDisplayWeight(lb: number, unit: WeightUnit): number {
  const n = Number(lb)
  const safe = Number.isFinite(n) ? n : 0
  return unit === 'kg' ? round1(safe * LB_PER_KG) : safe
}

/** display unit → lb. Identity in 'lb'; round1-quantized lb in 'kg'. Non-finite → 0. */
export function fromDisplayWeight(displayValue: number, unit: WeightUnit): number {
  const n = Number(displayValue)
  const safe = Number.isFinite(n) ? n : 0
  return unit === 'kg' ? round1(safe / LB_PER_KG) : safe
}

/** Read-only formatting: a bare number in 'lb' (matching today's suffix-free convention),
 *  the converted number + ' kg' in 'kg'. */
export function formatWeight(lb: number, unit: WeightUnit): string {
  const v = toDisplayWeight(lb, unit)
  return unit === 'kg' ? `${v} kg` : `${v}`
}
