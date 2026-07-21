import type { MergeFamily } from './apply.ts'

/**
 * Phase A confirmed merge families for Exercise Canonicalization.
 *
 * This step only pins down WHICH exercises merge into which family, by
 * name — it does NOT resolve real hosted ids. Every `REPLACE_AT_DATA_OP__*`
 * placeholder below must be replaced with the real `exercises.id` uuid by
 * Task 7, which:
 *   1. Runs a live lookup query (by name) against the `exercises` catalog.
 *   2. Calls `validateResolvedIds(phaseAFamilies, lookup)` to confirm every
 *      name resolves to exactly one row, and that each canonical name's
 *      row is a true canonical (canonical_id is null) — not itself an alias.
 *   3. Substitutes the resolved ids in for these placeholders before
 *      calling `buildMergeSql`.
 *
 * Do not hand-edit these placeholders with guessed ids — resolve them from
 * the runbook's lookup query so `validateResolvedIds` can actually catch a
 * bad guess.
 *
 * The Deadlift family is deliberately NOT included here — it's deferred
 * pending further review, per the canonicalization plan.
 */
export const phaseAFamilies: MergeFamily[] = [
  {
    canonicalName: 'Squat',
    canonicalId: 'REPLACE_AT_DATA_OP__Squat',
    aliasNames: ['Barbell Back Squat'],
    aliasIds: ['REPLACE_AT_DATA_OP__Barbell_Back_Squat'],
  },
  {
    canonicalName: 'Overhead Press',
    canonicalId: 'REPLACE_AT_DATA_OP__Overhead_Press',
    aliasNames: ['Barbell Overhead Press'],
    aliasIds: ['REPLACE_AT_DATA_OP__Barbell_Overhead_Press'],
  },
  {
    canonicalName: 'Pull-ups',
    canonicalId: 'REPLACE_AT_DATA_OP__Pull_ups',
    aliasNames: ['Pull Ups'],
    aliasIds: ['REPLACE_AT_DATA_OP__Pull_Ups'],
  },
  {
    canonicalName: 'Bent Over Barbell Row',
    canonicalId: 'REPLACE_AT_DATA_OP__Bent_Over_Barbell_Row',
    aliasNames: ['Barbell Bent Over Row'],
    aliasIds: ['REPLACE_AT_DATA_OP__Barbell_Bent_Over_Row'],
  },
]
