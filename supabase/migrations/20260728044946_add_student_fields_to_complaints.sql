/*
# Add denormalized student fields to complaints

1. Modified Tables
- `complaints`: add `student_roll` (text) and `student_name` (text) columns.
  These are denormalized from profiles so the warden (who logs in with a hardcoded
  password and has no Supabase auth session) can display student info without
  needing read access to the profiles table.

2. Security
- No policy changes. Existing complaint policies already allow anon+authenticated
  SELECT, which covers these new columns.

3. Important Notes
- Both columns are nullable so existing rows (if any) remain valid.
- New complaints will populate both columns from the student's profile at insert time.
*/

alter table public.complaints
  add column if not exists student_roll text,
  add column if not exists student_name text;
