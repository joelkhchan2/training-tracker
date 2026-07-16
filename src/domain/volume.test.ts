import { describe, it, expect } from 'vitest'
import { muscleGroupFor, sessionTonnage, setsByMuscleGroup } from './volume'

describe('muscleGroupFor', () => {
  it('override map wins over muscle text', () => {
    expect(muscleGroupFor('Squat', 'whatever')).toBe('Legs')
    expect(muscleGroupFor('Pull-ups', '')).toBe('Back')
  })
  it('keyword rules for un-mapped names', () => {
    expect(muscleGroupFor('Cable Fly', 'Pectoralis Major')).toBe('Chest')
    expect(muscleGroupFor('Pulldown', 'Latissimus Dorsi')).toBe('Back')
    expect(muscleGroupFor('Pushdown', 'Triceps Brachii')).toBe('Arms')
  })
  it('falls back to Unknown', () => { expect(muscleGroupFor('Mystery Move', 'flibberty')).toBe('Unknown') })
})

describe('sessionTonnage', () => {
  it('sums weight*reps', () => {
    expect(sessionTonnage([{exerciseName:'x',weight:100,reps:5},{exerciseName:'x',weight:50,reps:10}])).toBe(1000)
  })
})

describe('setsByMuscleGroup', () => {
  it('counts one per set, grouped', () => {
    expect(setsByMuscleGroup([
      { exerciseName: 'Squat' }, { exerciseName: 'Squat' }, { exerciseName: 'Bench Press' },
    ])).toEqual({ Legs: 2, Chest: 1 })
  })
})
