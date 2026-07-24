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
