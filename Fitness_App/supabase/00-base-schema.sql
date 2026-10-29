-- ============================================================
-- Rally: base schema (run FIRST on a new Supabase project)
--   1. supabase/00-base-schema.sql   <- this file: core tables, types, basic security rules
--   2. supabase/ALL-IN-ONE.sql       <- every feature built on top (waitlist, friends, DMs, safety, privacy...)
--   3. supabase/seed-demo-events.sql <- optional sample events
-- Safe to run again (skips anything that already exists).
-- ============================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- postgis puts spatial_ref_sys in public with no rls, so make it read only for app users
revoke all on public.spatial_ref_sys from anon, authenticated;
grant select on public.spatial_ref_sys to anon, authenticated;

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

  -- Fitness connections: only yours (live location policies are further down)
  drop policy if exists "own fitness connections" on public.fitness_connections;
  create policy "own fitness connections" on public.fitness_connections for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
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

-- ---------- Pieces from the hackathon patches (were only in the live database) ----------

-- true if you're the host or a current participant of the activity
create or replace function public.is_activity_member(p_activity uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (select 1 from activities a where a.id = p_activity and a.host_id = auth.uid())
      or exists (select 1 from activity_participants p
                 where p.activity_id = p_activity and p.user_id = auth.uid() and p.status <> 'left');
$$;

-- open upcoming activities within a radius, used by the browse page
create or replace function public.activities_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision)
returns table(id uuid, host_id uuid, host_name text, sport_id integer, sport_name text, title text, description text, type activity_type, opponent_team text, city text, address text, starts_at timestamptz, max_participants integer, joined_count integer, spots_left integer, status activity_status, night_mode boolean, lat double precision, lng double precision, distance_km double precision)
language sql stable
set search_path to 'public', 'extensions'
as $$
  select a.id, a.host_id, h.full_name, a.sport_id, s.name,
         a.title, a.description, a.type, a.opponent_team,
         a.city, a.address, a.starts_at,
         a.max_participants, c.n::int, (a.max_participants - c.n)::int,
         a.status, a.night_mode,
         ST_Y(a.location::geometry), ST_X(a.location::geometry),
         ST_Distance(a.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1000
    from activities a
    join profiles h on h.id = a.host_id
    join sports s on s.id = a.sport_id
    cross join lateral (
      select count(*) as n from activity_participants p
       where p.activity_id = a.id and p.status <> 'left'
    ) c
   where a.status = 'open'
     and a.starts_at > now()
     and ST_DWithin(a.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
   order by a.starts_at;
$$;

-- host scans a participant's qr token to check them in
create or replace function public.check_in(p_token uuid)
returns text
language plpgsql security definer
set search_path to 'public'
as $$
declare v_name text;
begin
  update activity_participants ap
     set status = 'checked_in', checked_in_at = coalesce(ap.checked_in_at, now())
    from activities a, profiles p
   where ap.qr_token = p_token
     and ap.status in ('joined', 'checked_in')
     and a.id = ap.activity_id and a.host_id = auth.uid()
     and p.id = ap.user_id
  returning p.full_name into v_name;
  if v_name is null then
    raise exception 'Invalid token or not the host of this activity';
  end if;
  return v_name;
end $$;

-- locks the activity row so two people can't take the last spot, closes it when full
create or replace function public.enforce_participant_cap()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare
  act activities%rowtype;
  current_count int;
begin
  select * into act from activities where id = new.activity_id for update;
  if act.status <> 'open' then
    raise exception 'This activity is closed';
  end if;
  select count(*) into current_count
    from activity_participants
    where activity_id = new.activity_id and status <> 'left';
  if current_count >= act.max_participants then
    raise exception 'This activity is full';
  end if;
  if current_count + 1 >= act.max_participants then
    update activities set status = 'closed' where id = new.activity_id;
  end if;
  return new;
end $$;

drop trigger if exists participant_cap on public.activity_participants;
create trigger participant_cap before insert on public.activity_participants
  for each row execute function enforce_participant_cap();

-- flags anyone who strays outside the night walk route corridor
create or replace function public.flag_geofence()
returns trigger
language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  r geography;
  corridor int;
  d float;
begin
  select route, corridor_radius_m into r, corridor from activities where id = new.activity_id;
  if r is null then return new; end if;
  d := ST_Distance(r, new.position);
  if d > corridor then
    insert into geofence_alerts (activity_id, user_id, meters_outside)
    values (new.activity_id, new.user_id, d - corridor);
  end if;
  return new;
end $$;

drop trigger if exists live_location_geofence on public.live_locations;
create trigger live_location_geofence after insert or update of position on public.live_locations
  for each row execute function flag_geofence();

-- views keep security_invoker on so they follow the rls on the tables underneath
create or replace view public.activity_details with (security_invoker = true) as
  select a.id, a.host_id, h.full_name as host_name, h.is_verified as host_verified,
         a.sport_id, s.name as sport_name, a.title, a.description, a.type, a.opponent_team,
         a.city, a.address, a.starts_at, a.max_participants,
         c.n::integer as joined_count, (a.max_participants - c.n)::integer as spots_left,
         a.status, a.night_mode, a.corridor_radius_m, a.checkin_interval_s,
         st_y(a.location::geometry) as lat, st_x(a.location::geometry) as lng,
         case when a.route is null then null::json else st_asgeojson(a.route::geometry)::json end as route_geojson
    from activities a
    join profiles h on h.id = a.host_id
    join sports s on s.id = a.sport_id
    cross join lateral (
      select count(*) as n from activity_participants p
       where p.activity_id = a.id and p.status <> 'left'::participant_status
    ) c;

create or replace view public.live_positions with (security_invoker = true) as
  select l.activity_id, l.user_id, p.full_name,
         st_y(l.position::geometry) as lat, st_x(l.position::geometry) as lng, l.updated_at
    from live_locations l
    join profiles p on p.id = l.user_id;

grant select on public.activity_details, public.live_positions to authenticated;

-- live location: everyone in the activity sees each other, you only share or change your own
drop policy if exists "members see live locations" on public.live_locations;
create policy "members see live locations" on public.live_locations for select
  using (is_activity_member(activity_id));
drop policy if exists "share own location" on public.live_locations;
create policy "share own location" on public.live_locations for insert
  with check (auth.uid() = user_id and is_activity_member(activity_id));
drop policy if exists "update own location" on public.live_locations;
create policy "update own location" on public.live_locations for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id and is_activity_member(activity_id));
drop policy if exists "stop sharing" on public.live_locations;
create policy "stop sharing" on public.live_locations for delete
  using (auth.uid() = user_id);
-- no insert policy on geofence_alerts, only the trigger writes to it
drop policy if exists "members see alerts" on public.geofence_alerts;
create policy "members see alerts" on public.geofence_alerts for select
  using (is_activity_member(activity_id));

notify pgrst, 'reload schema';
