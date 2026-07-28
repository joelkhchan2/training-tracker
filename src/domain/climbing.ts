/** V-scale grade helpers. `parseVGrade` turns a stored grade string ('V0'..'V8', and any
 *  'V<int>') into its numeric grade; returns null for anything that is not 'V' followed by a
 *  non-negative integer. `formatVGrade` is the inverse for display/storage. Pure — no I/O, no
 *  React. Kept separate from prDetection.ts (which owns the client-side PR-rule reference). */
export function parseVGrade(grade: string): number | null {
  const m = /^V(\d+)$/.exec(grade)
  return m ? Number(m[1]) : null
}

export function formatVGrade(n: number): string {
  return `V${n}`
}

/** Per-grade logging state from the UI: attempts and sends the user entered. */
export interface ClimbingEntryInput {
  grade: string
  attempts: number
  sends: number
}

/** A row ready for the log_climbing payload. `count` is the send total; `attempts >= count`. */
export interface NormalizedClimbingEntry {
  grade: string
  count: number
  attempts: number
}

/** Pure: turn per-grade {attempts, sends} into log_climbing rows. Include a grade only when it
 *  has any activity (attempts > 0 OR sends > 0), and clamp attempts up to sends so the DB
 *  invariant `attempts >= count` always holds (a send is at least one attempt). */
export function normalizeClimbingEntries(entries: ClimbingEntryInput[]): NormalizedClimbingEntry[] {
  return entries
    .filter((e) => e.attempts > 0 || e.sends > 0)
    .map((e) => ({ grade: e.grade, count: e.sends, attempts: Math.max(e.attempts, e.sends) }))
}
