import type { Discipline, Program } from '../types'
import { fiveThreeOne } from './fiveThreeOne'
import { strongLifts5x5 } from './strongLifts5x5'
import { pushPullLegs } from './pushPullLegs'
import { beginnerLinear } from './beginnerLinear'
import { startingStrength } from './startingStrength'
import { basicBeginner } from './basicBeginner'
import { greyskullLP } from './greyskullLP'

export interface PresetMeta {
  id: string
  name: string
  description: string
  discipline: Discipline
  daysPerWeek: number
  requiresTrainingMaxes: boolean
  tmKeys: string[]
  /** True for presets driven by AMRAP-based linear progression (`Scheme` type `linear`) —
   *  these need a starting working weight per main lift instead of training maxes. */
  requiresStartingWeights: boolean
  /** The main lifts (by exercise name) that need a starting weight, with a display label.
   *  Empty for percentage/fixed presets. */
  startingWeightLifts: { exerciseName: string; label: string }[]
  program: Program
}

/** Every distinct exercise name used by a `linear`-scheme exercise across a program's days,
 *  in first-seen order — used to build `startingWeightLifts` for the LP presets below. */
function linearSchemeLifts(program: Program): { exerciseName: string; label: string }[] {
  const seen = new Set<string>()
  const lifts: { exerciseName: string; label: string }[] = []
  for (const day of program.days) {
    for (const ex of day.exercises) {
      if (ex.scheme.type !== 'linear' || seen.has(ex.exerciseName)) continue
      seen.add(ex.exerciseName)
      lifts.push({ exerciseName: ex.exerciseName, label: ex.exerciseName })
    }
  }
  return lifts
}

export const PRESETS: PresetMeta[] = [
  {
    id: 'fiveThreeOne',
    name: fiveThreeOne.name,
    description: 'Wendler 5/3/1 — percentage-based strength cycles.',
    discipline: fiveThreeOne.discipline,
    daysPerWeek: fiveThreeOne.days.length,
    requiresTrainingMaxes: true,
    tmKeys: ['squat', 'benchPress', 'barbellDeadlift', 'overheadPress'],
    requiresStartingWeights: false,
    startingWeightLifts: [],
    program: fiveThreeOne,
  },
  {
    id: 'strongLifts5x5',
    name: strongLifts5x5.name,
    description: 'Alternating A/B full-body 5x5 — straight sets, +weight every session you hit all 25 reps, deload 10% after 3 stalls.',
    discipline: strongLifts5x5.discipline,
    daysPerWeek: strongLifts5x5.days.length,
    requiresTrainingMaxes: false,
    tmKeys: [],
    requiresStartingWeights: true,
    startingWeightLifts: linearSchemeLifts(strongLifts5x5),
    program: strongLifts5x5,
  },
  {
    id: 'pushPullLegs',
    name: pushPullLegs.name,
    description: 'Push/Pull/Legs split for hypertrophy-focused training.',
    discipline: pushPullLegs.discipline,
    daysPerWeek: pushPullLegs.days.length,
    requiresTrainingMaxes: false,
    tmKeys: [],
    requiresStartingWeights: false,
    startingWeightLifts: [],
    program: pushPullLegs,
  },
  {
    id: 'beginnerLinear',
    name: beginnerLinear.name,
    description: 'Simple 3-day full-body linear progression for beginners.',
    discipline: beginnerLinear.discipline,
    daysPerWeek: beginnerLinear.days.length,
    requiresTrainingMaxes: false,
    tmKeys: [],
    requiresStartingWeights: false,
    startingWeightLifts: [],
    program: beginnerLinear,
  },
  {
    id: 'startingStrength',
    name: startingStrength.name,
    description: 'Mark Rippetoe\'s novice program — alternating A/B, 3x5 straight sets (deadlift 1x5), +10 lbs/session lower body, +5 lbs/session press & bench.',
    discipline: startingStrength.discipline,
    daysPerWeek: startingStrength.days.length,
    requiresTrainingMaxes: false,
    tmKeys: [],
    requiresStartingWeights: true,
    startingWeightLifts: linearSchemeLifts(startingStrength),
    program: startingStrength,
  },
  {
    id: 'basicBeginner',
    name: basicBeginner.name,
    description: 'r/Fitness\'s classic A/B novice routine — 3x5+ with an AMRAP last set, doubled jumps on big AMRAP sets, deload on a missed one.',
    discipline: basicBeginner.discipline,
    daysPerWeek: basicBeginner.days.length,
    requiresTrainingMaxes: false,
    tmKeys: [],
    requiresStartingWeights: true,
    startingWeightLifts: linearSchemeLifts(basicBeginner),
    program: basicBeginner,
  },
  {
    id: 'greyskullLP',
    name: greyskullLP.name,
    description: 'Greyskull LP — 2x5, 1x5+ on the big lifts, +weight every session, ~10% reset on a missed AMRAP.',
    discipline: greyskullLP.discipline,
    daysPerWeek: greyskullLP.days.length,
    requiresTrainingMaxes: false,
    tmKeys: [],
    requiresStartingWeights: true,
    startingWeightLifts: linearSchemeLifts(greyskullLP),
    program: greyskullLP,
  },
]

export { fiveThreeOne, strongLifts5x5, pushPullLegs, beginnerLinear, startingStrength, basicBeginner, greyskullLP }
