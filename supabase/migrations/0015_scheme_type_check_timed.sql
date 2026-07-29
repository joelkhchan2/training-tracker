-- Widen program_exercises_scheme_type_valid (0011) to allow the new `timed` scheme
-- type (Part B of the timed-PRs-and-prescriptions spec): a program can now prescribe
-- a duration-per-set exercise (e.g. "Front Lever Progression 4x8s"), stored as
-- { type: 'timed', sets: [{ seconds: 8 }, ...] }.
--
-- Idempotent: drop-then-add, same pattern as 0011, safe to re-run. Must be applied
-- (manually, via the Supabase MCP/dashboard — this app has no CI migration step)
-- together with the normalizeScheme/getPrescription code deploy: widening only this
-- constraint without the matching normalizeScheme 'timed' branch would let a 'timed'
-- row be written but silently emptied on every read (falls into normalizeScheme's
-- unknown-type coercion to `{ type: 'fixed', sets: [] }`).
alter table program_exercises drop constraint if exists program_exercises_scheme_type_valid;
alter table program_exercises
  add constraint program_exercises_scheme_type_valid
  check (coalesce(scheme->>'type', '') in ('percentage', 'fixed', 'linear', 'timed'));
