export function epley1RM(weight: number, reps: number): number {
  const w = Number(weight) || 0
  const r = Number(reps) || 0
  return w > 0 && r > 0 ? w * (1 + r / 30) : 0
}

export function weightForReps(oneRM: number, reps: number): number {
  const o = Number(oneRM) || 0
  const r = Number(reps) || 0
  return o > 0 && r > 0 ? o / (1 + r / 30) : 0
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

const TABLE_PERCENTAGES = [95, 90, 85, 80, 75, 70, 65, 60] as const

/** Pure: training loads at common percentages of an estimated 1RM. Receives the UNrounded e1RM
 *  and rounds each load once (to one decimal), so it is unit-agnostic (lb or kg). 100% is the
 *  headline estimate itself, so the table starts at 95%. */
export function percentageTable(e1rm: number): { pct: number; load: number }[] {
  return TABLE_PERCENTAGES.map((pct) => ({ pct, load: round1(e1rm * pct / 100) }))
}
