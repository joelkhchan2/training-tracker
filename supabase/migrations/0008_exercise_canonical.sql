-- Exercise canonicalization: let one exercise row be marked as an alias of
-- another so duplicate/near-duplicate catalog entries can be merged without
-- deleting rows (which would orphan history that references them).
-- null canonical_id = this row is canonical (or not yet merged).
-- a set canonical_id = this row is an ALIAS pointing at its canonical exercise.
-- Chains (alias -> alias -> canonical) are forbidden: canonical_id must always
-- point directly at a canonical (canonical_id is null) row. That invariant is
-- validated in the merge tooling (apply.ts), not the database; a DB trigger to
-- enforce it here is a deferred nice-to-have. Additive only: nullable, no
-- backfill, no RLS change, no other table touched.
alter table exercises add column canonical_id uuid references exercises(id);
create index on exercises(canonical_id);
