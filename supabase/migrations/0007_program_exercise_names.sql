-- Denormalize the referenced exercise's display name/kind onto program_exercises
-- so a program remains portable across users: the `exercises` catalog is
-- global-or-own by RLS, so an exercise_id that resolves for the program's
-- owner may not resolve (or may resolve to a different row) for another
-- user importing/sharing the program. Additive only: nullable, no backfill,
-- no RLS change (the existing program_exercises read-through policy already
-- covers these columns).
alter table program_exercises add column exercise_name text;
alter table program_exercises add column exercise_type text;
