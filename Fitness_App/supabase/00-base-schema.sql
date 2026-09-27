-- ============================================================
-- Rally: base schema (run FIRST on a new Supabase project)
--   1. supabase/00-base-schema.sql   <- this file: core tables, types, basic security rules
--   2. supabase/ALL-IN-ONE.sql       <- every feature built on top (waitlist, friends, DMs, safety, privacy...)
--   3. supabase/seed-demo-events.sql <- optional sample events
-- Safe to run again (skips anything that already exists).
-- ============================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------- Types ----------
do $$ begin create type sport_level as enum ('casual', 'competitive', 'professional', 'd1', 'd2', 'ex_player', 'retired');
exception when duplicate_object then null; end $$;
do $$ begin create type activity_type as enum ('casual', 'team');
exception when duplicate_object then null; end $$;
do $$ begin create type activity_status as enum ('open', 'closed', 'cancelled', 'completed');
exception when duplicate_object then null; end $$;
do $$ begin create type participant_status as enum ('joined', 'checked_in', 'left');
exception when duplicate_object then null; end $$;
do $$ begin create type safety_status as enum ('ok', 'safe', 'need_help', 'no_response', 'sos');
exception when duplicate_object then null; end $$;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  bio text,
  city text,
  location geography(Point, 4326),
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.sports (
  id serial primary key,
  name text not null unique
);

create table if not exists public.user_sports (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sport_id integer not null references public.sports(id),
  level sport_level not null default 'casual',
  primary key (user_id, sport_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  sport_id integer not null references public.sports(id),
  title text not null,
  description text,
  type activity_type not null default 'casual',
  opponent_team text,
  city text not null,
  address text,
  location geography(Point, 4326) not null,
  starts_at timestamptz not null,
  max_participants integer not null check (max_participants > 0),
  status activity_status not null default 'open',
  created_at timestamptz not null default now(),
  route geography(LineString, 4326),
  corridor_radius_m integer not null default 200 check (corridor_radius_m > 0),
  night_mode boolean not null default false,
  checkin_interval_s integer not null default 900 check (checkin_interval_s >= 30)
);

create table if not exists public.activity_participants (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status participant_status not null default 'joined',
  qr_token uuid not null default gen_random_uuid(),
  joined_at timestamptz not null default now(),
  checked_in_at timestamptz,
  primary key (activity_id, user_id)
);

create table if not exists public.activity_photos (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text not null
);

create table if not exists public.safety_checkins (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status safety_status not null,
  created_at timestamptz not null default now()
);

create table if not exists public.fitness_connections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  opted_in boolean not null default false,
  primary key (user_id, provider)
);

create table if not exists public.live_locations (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position geography(Point, 4326) not null,
  updated_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table if not exists public.geofence_alerts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  meters_outside double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists activities_starts_at_idx on public.activities (starts_at);
create index if not exists activities_location_idx on public.activities using gist (location);

-- ---------- Row-level security (basic rules; ALL-IN-ONE.sql adds the rest) ----------
alter table public.profiles enable row level security;
alter table public.sports enable row level security;
alter table public.user_sports enable row level security;
alter table public.activities enable row level security;
alter table public.activity_participants enable row level security;
alter table public.activity_photos enable row level security;
alter table public.comments enable row level security;
alter table public.messages enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.safety_checkins enable row level security;
alter table public.fitness_connections enable row level security;
alter table public.live_locations enable row level security;
alter table public.geofence_alerts enable row level security;

do $$
begin
  -- Profiles: signed-in users can see profiles (name, photo, verified); you edit only your own
  drop policy if exists "profiles readable" on public.profiles;
  create policy "profiles readable" on public.profiles for select to authenticated using (true);
  drop policy if exists "edit own profile" on public.profiles;
  create policy "edit own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

  -- Sports list: public
  drop policy if exists "sports readable" on public.sports;
  create policy "sports readable" on public.sports for select to anon, authenticated using (true);

  -- Your sports: everyone signed in can see them (used for matching); you manage your own
  drop policy if exists "user sports readable" on public.user_sports;
  create policy "user sports readable" on public.user_sports for select to authenticated using (true);
  drop policy if exists "manage own sports" on public.user_sports;
  create policy "manage own sports" on public.user_sports for insert to authenticated with check (user_id = auth.uid());
  drop policy if exists "remove own sports" on public.user_sports;
  create policy "remove own sports" on public.user_sports for delete to authenticated using (user_id = auth.uid());

  -- Events: everyone signed in can browse; you create events as yourself; only the host edits
  drop policy if exists "events readable" on public.activities;
  create policy "events readable" on public.activities for select to authenticated using (true);
  drop policy if exists "host creates events" on public.activities;
  create policy "host creates events" on public.activities for insert to authenticated with check (host_id = auth.uid());
  drop policy if exists "host edits events" on public.activities;
  create policy "host edits events" on public.activities for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

  -- Who's going: visible to signed-in users (joining goes through join_activity / request_join)
  drop policy if exists "participants readable" on public.activity_participants;
  create policy "participants readable" on public.activity_participants for select to authenticated using (true);

  -- Emergency contacts: only yours
  drop policy if exists "own contacts" on public.trusted_contacts;
  create policy "own contacts" on public.trusted_contacts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

  -- Safety check-ins: you record and see your own (hosts see their event's via ALL-IN-ONE.sql)
  drop policy if exists "own safety checkins" on public.safety_checkins;
  create policy "own safety checkins" on public.safety_checkins for select to authenticated using (user_id = auth.uid());
  drop policy if exists "record own safety checkin" on public.safety_checkins;
  create policy "record own safety checkin" on public.safety_checkins for insert to authenticated with check (user_id = auth.uid());

  -- Fitness connections and live location: only yours
  drop policy if exists "own fitness connections" on public.fitness_connections;
  create policy "own fitness connections" on public.fitness_connections for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  drop policy if exists "own live location" on public.live_locations;
  create policy "own live location" on public.live_locations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  drop policy if exists "own geofence alerts" on public.geofence_alerts;
  create policy "own geofence alerts" on public.geofence_alerts for select to authenticated using (user_id = auth.uid());
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.sports to anon, authenticated;
grant usage, select on sequence public.sports_id_seq to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.activities to authenticated;
grant select, insert, delete on public.user_sports to authenticated;
grant select, insert, update, delete on public.trusted_contacts to authenticated;
grant select, insert on public.safety_checkins to authenticated;
grant select, insert, update, delete on public.fitness_connections to authenticated;
grant select, insert, update, delete on public.live_locations to authenticated;
grant select on public.geofence_alerts to authenticated;

notify pgrst, 'reload schema';
