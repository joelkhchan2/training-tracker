import type { Discipline, Program } from '../types'
import { fiveThreeOne } from './fiveThreeOne'
import { strongLifts5x5 } from './strongLifts5x5'
import { pushPullLegs } from './pushPullLegs'
import { beginnerLinear } from './beginnerLinear'

export interface PresetMeta {
  id: string
  name: string
  description: string
  discipline: Discipline
  daysPerWeek: number
  requiresTrainingMaxes: boolean
  tmKeys: string[]
  program: Program
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
    program: fiveThreeOne,
  },
  {
    id: 'strongLifts5x5',
    name: strongLifts5x5.name,
    description: 'Alternating A/B full-body 5x5 with linear weight progression each session.',
    discipline: strongLifts5x5.discipline,
    daysPerWeek: strongLifts5x5.days.length,
    requiresTrainingMaxes: false,
    tmKeys: [],
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
    program: beginnerLinear,
  },
]

export { fiveThreeOne, strongLifts5x5, pushPullLegs, beginnerLinear }
