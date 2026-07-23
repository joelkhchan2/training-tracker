/** Dependency-free inline-SVG polyline trend for a small numeric series
 *  (e.g. e1RM across recent sessions, oldest→newest). Renders nothing for
 *  fewer than 2 points — there's no trend to draw. */
export function Sparkline({ values, width = 96, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} className="text-accent" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
