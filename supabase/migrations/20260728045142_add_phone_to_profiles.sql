/*
# Add phone column to profiles

1. Modified Tables
- `profiles`: add `phone` (text, nullable) so students can store a contact number.
2. Security
- No policy changes (existing profile policies already cover the new column).
*/

alter table public.profiles
  add column if not exists phone text;
