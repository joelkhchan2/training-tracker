function parse(d: string): Date { return new Date(d + 'T00:00:00Z') }
function key(d: Date): string { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

export function dailyStreak(doneDays: string[], today: string): { currentStreak: number; thisWeekDays: number } {
  const done = new Set(doneDays)
  const t = parse(today)

  let currentStreak = 0
  for (let offset = 0; offset < 60; offset++) {
    const day = key(addDays(t, -offset))
    if (done.has(day)) currentStreak++
    else if (offset > 0) break // a miss on any day other than today breaks the streak
  }

  // thisWeekDays: Monday..today only. getUTCDay(): 0=Sun..6=Sat
  const dow = t.getUTCDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const daysToCheck = -mondayOffset + 1
  const monday = addDays(t, mondayOffset)
  let thisWeekDays = 0
  for (let i = 0; i < daysToCheck; i++) if (done.has(key(addDays(monday, i)))) thisWeekDays++

  return { currentStreak, thisWeekDays }
}
