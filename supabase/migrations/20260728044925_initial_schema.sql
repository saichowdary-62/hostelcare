/*
# Initial schema for Aditya University Complaint Management

1. New Tables
- `profiles`: student account details linked to Supabase auth users.
  Columns: id (uuid, PK, refs auth.users), roll_number (text, unique), name, email (unique),
  hostel, block, floor, room, created_at, updated_at.
- `complaints`: maintenance complaints submitted by students.
  Columns: id (uuid, PK), student_id (uuid, refs profiles), hostel, block, floor, room,
  category, description, image_url, status (Pending/Under Repair/Completed), created_at, updated_at.
- `complaint_updates`: audit trail for status changes.
  Columns: id (uuid, PK), complaint_id (uuid, refs complaints), updated_by (uuid, refs profiles),
  status, remark, created_at.

2. Security (RLS)
- profiles: students can read/update only their own profile.
- complaints: students can read all complaints (warden needs access without Supabase auth);
  students can insert only their own (auth.uid() = student_id);
  updates allowed for anon+authenticated so the localStorage-authenticated warden can change status.
- complaint_updates: readable by anon+authenticated; insertable by anon+authenticated.

3. Functions / Triggers
- create_profile_for_new_user(): auto-creates a profile row when a student signs up via Supabase Auth.
- get_email_for_roll(): lets the login form look up email by roll number before auth.
- set_updated_at(): keeps updated_at current on edits.

4. Important Notes
- The warden logs in with a hardcoded username/password (no Supabase auth), so complaint SELECT
  and status UPDATE policies must allow the anon role for the warden to function.
- Students authenticate via Supabase Auth and can only insert complaints they own.
*/

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  roll_number text unique not null,
  name text not null,
  email text unique not null,
  hostel text,
  block text,
  floor text,
  room text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  hostel text not null,
  block text not null,
  floor text not null,
  room text not null,
  category text not null,
  description text not null,
  image_url text,
  status text not null default 'Pending'
    check (status in ('Pending', 'Under Repair', 'Completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.complaint_updates (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  updated_by uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('Pending', 'Under Repair', 'Completed')),
  remark text,
  created_at timestamptz not null default now()
);

create index if not exists complaints_student_id_idx on public.complaints(student_id);
create index if not exists complaints_created_at_idx on public.complaints(created_at desc);
create index if not exists complaint_updates_complaint_id_idx on public.complaint_updates(complaint_id);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, roll_number, name, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'roll_number',
    new.raw_user_meta_data ->> 'name',
    new.email
  );
  return new;
end;
$$;

create or replace function public.get_email_for_roll(roll_number_input text)
returns text language sql security definer set search_path = public stable as $$
  select email from public.profiles where roll_number = trim(roll_number_input) limit 1;
$$;

grant execute on function public.get_email_for_roll(text) to anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at before update on public.complaints
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_updates enable row level security;

-- profiles: students read/update own
drop policy if exists "Students read own profile" on public.profiles;
create policy "Students read own profile" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Students update own profile" on public.profiles;
create policy "Students update own profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- complaints: readable by anon+authenticated (warden has no Supabase session)
drop policy if exists "Read complaints" on public.complaints;
create policy "Read complaints" on public.complaints
for select to anon, authenticated using (true);

-- complaints: students insert only their own
drop policy if exists "Students create own complaints" on public.complaints;
create policy "Students create own complaints" on public.complaints
for insert to authenticated with check ((select auth.uid()) = student_id);

-- complaints: status updates allowed for anon+authenticated (warden updates status)
drop policy if exists "Update complaint status" on public.complaints;
create policy "Update complaint status" on public.complaints
for update to anon, authenticated using (true) with check (true);

-- complaint_updates: readable + insertable by anon+authenticated
drop policy if exists "Read complaint updates" on public.complaint_updates;
create policy "Read complaint updates" on public.complaint_updates
for select to anon, authenticated using (true);

drop policy if exists "Insert complaint updates" on public.complaint_updates;
create policy "Insert complaint updates" on public.complaint_updates
for insert to anon, authenticated with check (true);
