import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
import { useProfile } from '../../data/profile'
import { useSessionStore } from '../workout/sessionStore'
import type { Discipline } from '../../domain'

/** Shared "start/resume a session" actions behind the "+ Log" entry points (the Home-screen
 *  FAB in AppLayout, and the in-session "+ Log" buttons on the full-screen Workout/Climbing/
 *  Cardio pages) — one place for the enabled-disciplines gating and the ad-hoc-vs-resume
 *  strength logic, so every entry point behaves identically. */
export function useLogMenuActions() {
  const nav = useNavigate()
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)

  const cardioEnabled = (profile?.enabled_disciplines ?? []).includes('cardio')
  const climbingEnabled = (profile?.enabled_disciplines ?? []).includes('climbing')

  /** Starts a blank, off-program strength session and jumps straight into it. If a workout is
   *  already in progress (started here or from today's prescription) we don't wipe it — just
   *  go there, so entered-but-unsaved data is never silently discarded. */
  function startStrength() {
    const store = useSessionStore.getState()
    if (store.status === 'active' && store.exercises.length > 0) {
      // Already on /workout (in-session "+ Log" button) this is a no-op nav, which is fine —
      // from Home it routes there so Home owns the resume/start-new choice without wiping.
      nav('/')
      return
    }
    store.startAdHoc({ clientId: crypto.randomUUID(), startedAt: new Date().toISOString() })
    nav('/workout')
  }

  return {
    cardioEnabled,
    climbingEnabled,
    startStrength,
    goCardio: () => nav('/cardio/new'),
    goClimbing: () => nav('/climbing/new'),
  }
}

export interface LogMenuOption {
  discipline: Discipline
  label: string
  onSelect: () => void
}

/** Builds the list of "+ Log" options available right now, minus `exclude` (the discipline
 *  already being logged on the current screen — there's no reason to offer switching to the
 *  same session type you're already in). */
export function useLogMenuOptions(exclude?: Discipline): LogMenuOption[] {
  const { cardioEnabled, climbingEnabled, startStrength, goCardio, goClimbing } = useLogMenuActions()
  const options: LogMenuOption[] = []
  if (exclude !== 'strength') options.push({ discipline: 'strength', label: 'Strength workout', onSelect: startStrength })
  if (exclude !== 'cardio' && cardioEnabled) options.push({ discipline: 'cardio', label: 'Cardio', onSelect: goCardio })
  if (exclude !== 'climbing' && climbingEnabled) options.push({ discipline: 'climbing', label: 'Climbing', onSelect: goClimbing })
  return options
}
