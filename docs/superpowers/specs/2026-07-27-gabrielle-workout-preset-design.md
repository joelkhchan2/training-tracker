# Gabrielle's Workout — bundled preset

**Date:** 2026-07-27
**Status:** Approved design
**Repo:** `training-tracker`

## Goal

Add Gabrielle's gym routine (from a shared Google-Sheet "Workout Tracker" CSV) as a
selectable program in the app, so she can activate it and log against it like any
built-in program.

Source sheet: single full-body gym day, titled "Gym Workout Tracker · Goal 3×12",
with columns `Exercise · Wt · Set1 · Set2 · Set3 · ✓done`.

## Approach

Add it as a **bundled preset**, the same mechanism the seven existing programs use
(`fiveThreeOne`, `pushPullLegs`, etc.). No DB migration or seeding.

- New file `src/domain/presets/gabrielleWorkout.ts` exporting a `Program`.
- One `PresetMeta` entry registered in `src/domain/presets/index.ts` (added to the
  `PRESETS` array and re-exported at the bottom).

Once registered it appears automatically in the **Presets** section of `/programs`,
previews via `ProgramPreview`, and activates via `ActivateSheet` → `useActivateProgram`,
which clones it into the user's own rows and is consumed by the workout loop.

Alternative considered and rejected: seeding a public DB program via a migration. More
moving parts (RLS, migration, seed rows) for no benefit — presets are the intended
extension point for app-bundled programs.

## Program definition

- `name: "Gabrielle's Workout"`
- `discipline: 'strength'`
- Single `ProgramDay` (name: `"Full Body"`)
- All lifts use the `fixed` scheme at **3 × 12** (the sheet's stated goal). The sheet's
  logged reps (11/11, 10/8, …) are past performance, not targets — ignored.
- Weights from the sheet are **baked in** as `FixedSet.weight` targets.
- **No `progressionRule`** — weights are managed manually. Being a single-day program,
  the cursor simply repeats the same day every session.

| Order | Exercise | Scheme | Weight |
|---|---|---|---|
| 0 | Treadmill (warm-up) | fixed, 1 set | — |
| 1 | 45° Leg Press | fixed, 3 × 12 | 90 |
| 2 | Pull-down | fixed, 3 × 12 | 70 |
| 3 | Leg Extensions | fixed, 3 × 12 | 110 |
| 4 | Leg Curl | fixed, 3 × 12 | 70 |
| 5 | Shoulder Press | fixed, 3 × 12 | 40 |
| 6 | Cable Row | fixed, 3 × 12 | 66 |
| 7 | Decline Sit-ups | fixed, 3 × 12 | none (bodyweight) |
| 8 | Treadmill (cool-down) | fixed, 1 set | — |

Two `Treadmill` entries with the same name are fine — exercises are referenced by name
and distinguished by `order`; both resolve to the same catalog exercise on activation.

### PresetMeta

```ts
{
  id: 'gabrielleWorkout',
  name: "Gabrielle's Workout",
  description: "Gabrielle's full-body gym day — 3×12 on each lift with a treadmill "
    + "warm-up and cool-down. Weights preset from her sheet; adjust as you progress.",
  discipline: 'strength',
  daysPerWeek: 1,
  requiresTrainingMaxes: false,
  tmKeys: [],
  requiresStartingWeights: false,
  startingWeightLifts: [],
  program: gabrielleWorkout,
}
```

## Decisions

- **Both leg-isolation exercises** (Leg Extensions + Leg Curl) are included as normal
  slots. The sheet marks them "(alt)"; the app has no program-level alternate concept.
  She logs whichever she does and leaves the other unchecked, or uses the mid-workout
  swap (tap the exercise name) — a real, tested feature.
- **Treadmill** is included as a single check-off set at each end of the day (the model
  has no "zero-set" exercise, so a single set she taps ✓ is the closest fit). The set is
  `{ reps: 1 }` with no weight; the value is nominal (she just taps ✓).
- **Exercise names kept verbatim** from the sheet (no remap to catalog canonicals).
  Unmatched names auto-create as user-owned custom weighted exercises at activation via
  `resolveExerciseIds` — the app's normal behavior.

## Known limitations (model constraints, out of scope to change)

1. Prescription-sourced exercises always render with `kind: 'strength'`
   (`startFromPrescription` in `sessionStore.ts` hardcodes it), so Treadmill and
   Decline Sit-ups show a **weight field** the user simply leaves blank. A program can't
   mark an exercise bodyweight.
2. Treadmill also shows a **reps field**; it's a check-off, so it's ignored. Duration is
   not tracked.

These are accepted as-is; fixing them would mean touching core workout code, which is
outside this task's scope.

## Testing

Follow the existing preset test pattern. Assert:
- `gabrielleWorkout` is registered in `PRESETS` with `id: 'gabrielleWorkout'`.
- One day, nine exercises in the expected order.
- Each lifting exercise has 3 fixed sets of 12 reps; the two treadmill entries have 1
  set each.
- Baked-in weights match the table above; Decline Sit-ups has no weight.

## Out of scope

- Multi-day programming (the sheet is a single day).
- Auto-progression.
- Any change to the workout UI, the exercise catalog, or DB schema.
