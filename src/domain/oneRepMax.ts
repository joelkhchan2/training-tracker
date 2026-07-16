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
