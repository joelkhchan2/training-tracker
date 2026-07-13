-- Table-level DML GRANTs for the app-facing Postgres roles.
--
-- RLS policies (added in 0001/0002) restrict which ROWS a role can see or
-- change, but Postgres also requires a table-level privilege before RLS is
-- even evaluated. Without these grants, anon/authenticated get
-- "permission denied for table X" (42501) on every insert/select, even
-- though the RLS policies are correct. This migration grants the standard
-- Supabase baseline privileges so the app roles can perform DML; RLS still
-- fully restricts which rows are visible/mutable per user.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
