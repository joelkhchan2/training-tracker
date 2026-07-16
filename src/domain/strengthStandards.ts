const STANDARDS: Record<string, Record<string, number>> = {
  'Squat':            { Beginner: 0.75, Novice: 1.25, Intermediate: 1.50, Advanced: 2.00, Elite: 2.50 },
  'Bench Press':      { Beginner: 0.50, Novice: 0.75, Intermediate: 1.00, Advanced: 1.50, Elite: 2.00 },
  'Barbell Deadlift': { Beginner: 1.00, Novice: 1.50, Intermediate: 2.00, Advanced: 2.50, Elite: 3.00 },
  'Overhead Press':   { Beginner: 0.35, Novice: 0.55, Intermediate: 0.80, Advanced: 1.10, Elite: 1.40 },
}
const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite']

export interface StrengthResult { level: string; ratio: number; nextLevel: string | null; nextWeight: number | null }

export function strengthLevel(e1rm: number, bodyWeight: number, lift: string): StrengthResult | null {
  const table = STANDARDS[lift]
  if (!table || !e1rm || !bodyWeight) return null
  const ratio = e1rm / bodyWeight
  let level: string | null = null
  let nextLevel: string | null = null
  let nextRatio: number | null = null
  for (const tier of LEVELS) {
    if (ratio >= table[tier]) level = tier
    else { nextLevel = tier; nextRatio = table[tier]; break }
  }
  return {
    level: level ?? 'Below Beginner',
    ratio: Math.round(ratio * 100) / 100,
    nextLevel,
    nextWeight: nextRatio == null ? null : Math.round(nextRatio * bodyWeight),
  }
}
