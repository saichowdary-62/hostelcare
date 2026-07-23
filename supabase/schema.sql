-- Aditya University: run this complete script in Supabase Dashboard -> SQL Editor.
-- It is safe to run again: existing tables are kept and policies/triggers are refreshed.

-- 1. Student account details. Authentication users themselves are managed by Supabase in auth.users.
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

-- 2. Maintenance complaints submitted by students.
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

-- 3. Audit trail for complaint-status changes.
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

-- Create a profile automatically whenever a student creates an Auth account.
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

-- Allows the login form to find the email linked to a roll number before
-- Supabase Auth verifies the password. It returns no other profile fields.
create or replace function public.get_email_for_roll(roll_number_input text)
returns text language sql security definer set search_path = public stable as $$
  select email from public.profiles where roll_number = trim(roll_number_input) limit 1;
$$;

grant execute on function public.get_email_for_roll(text) to anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

-- Keep the updated_at timestamp current on profile and complaint edits.
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

-- Row Level Security: each student can access only their own data.
alter table public.profiles enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_updates enable row level security;

drop policy if exists "Students read own profile" on public.profiles;
create policy "Students read own profile" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Students update own profile" on public.profiles;
create policy "Students update own profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Students read own complaints" on public.complaints;
create policy "Students read own complaints" on public.complaints
for select to authenticated using ((select auth.uid()) = student_id);

drop policy if exists "Students create own complaints" on public.complaints;
create policy "Students create own complaints" on public.complaints
for insert to authenticated with check ((select auth.uid()) = student_id);

drop policy if exists "Students read updates for own complaints" on public.complaint_updates;
create policy "Students read updates for own complaints" on public.complaint_updates
for select to authenticated using (
  exists (
    select 1 from public.complaints
    where complaints.id = complaint_updates.complaint_id
      and complaints.student_id = (select auth.uid())
  )
);
