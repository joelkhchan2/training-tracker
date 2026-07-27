-- Reject persisted program_exercises whose `scheme` jsonb has an unknown or missing
-- `type`. The engine only interprets 'percentage' | 'fixed' | 'linear'; a hand-written
-- or legacy row with any other type (e.g. the invented 'percentage_flat' that caused a
-- white-screen crash when a program was tapped) is otherwise accepted silently and only
-- degraded/mis-rendered at read time. This constraint stops the bad row at the source.
--
-- Verified 0 existing rows violate this before adding, so validation is safe. Malformed
-- *shape* (a valid type but a non-array `sets`/`weeks`) is still handled defensively at
-- the DB->domain read boundary (normalizeScheme in src/data/queries.ts); this covers the
-- unknown-type class specifically. coalesce(...,'') so a missing `type` is also rejected
-- (a bare CHECK would let NULL through).
alter table program_exercises
  add constraint program_exercises_scheme_type_valid
  check (coalesce(scheme->>'type', '') in ('percentage', 'fixed', 'linear'));
