-- Rally (working name): Supabase / Postgres schema
-- Run in the Supabase SQL editor, top to bottom.

create extension if not exists postgis;

-- ---------- Enums ----------
create type sport_level as enum ('casual', 'competitive', 'professional', 'd1', 'd2', 'ex_player', 'retired');
create type activity_type as enum ('casual', 'team');
create type activity_status as enum ('open', 'closed', 'cancelled', 'completed');
create type participant_status as enum ('joined', 'checked_in', 'left');
create type safety_status as enum ('safe', 'need_help', 'no_response');

-- ---------- Profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  bio text,
  city text,
  location geography(point, 4326),          -- user's home area, used for notifications
  is_verified boolean not null default false, -- flipped by a (mocked) ID verification step; never store ID images
  created_at timestamptz not null default now()
);

-- Auto-create a profile row on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'New user'));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Sports ----------
create table sports (
  id serial primary key,
  name text unique not null
);
insert into sports (name) values
  ('Cycling'), ('Basketball'), ('Running'), ('Hiking'), ('Badminton'),
  ('Tennis'), ('Football'), ('Flag football'), ('Rugby');

create table user_sports (
  user_id uuid references profiles(id) on delete cascade,
  sport_id int references sports(id),
  level sport_level not null default 'casual',
  primary key (user_id, sport_id)
);

-- ---------- Activities ----------
create table activities (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles(id) on delete cascade,
  sport_id int not null references sports(id),
  title text not null,
  description text,
  type activity_type not null default 'casual',
  opponent_team text,                         -- team events: who the host's team is challenging
  city text not null,
  address text,
  location geography(point, 4326) not null,
  starts_at timestamptz not null,
  max_participants int not null check (max_participants > 0),
  status activity_status not null default 'open',
  created_at timestamptz not null default now()
);
create index activities_location_idx on activities using gist (location);
create index activities_status_idx on activities (status, starts_at);

-- ---------- Participants ----------
create table activity_participants (
  activity_id uuid references activities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  status participant_status not null default 'joined',
  qr_token uuid not null default gen_random_uuid(),  -- encoded in the user's check-in QR code
  joined_at timestamptz not null default now(),
  checked_in_at timestamptz,
  primary key (activity_id, user_id)
);

-- Enforce the cap in the database so two simultaneous joins can't exceed it.
create or replace function enforce_participant_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  act activities%rowtype;
  current_count int;
begin
  select * into act from activities where id = new.activity_id for update; -- row lock
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

create trigger participant_cap
  before insert on activity_participants
  for each row execute function enforce_participant_cap();

-- QR check-in: host scans a user's token; returns the attendee's name for the host UI
create or replace function check_in(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
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

-- activities_nearby() is defined in map_patch.sql (returns lat, lng, distance_km, spots_left).

-- ---------- Social: photos, comments, messages ----------
create table activity_photos (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  image_url text not null,                    -- file lives in Supabase Storage
  created_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table messages (                        -- group chat per activity; use Supabase Realtime on this table
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- Safety ----------
create table trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  phone text not null
);

create table safety_checkins (                 -- "Is the event still going on?" responses
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status safety_status not null,
  created_at timestamptz not null default now()
);

-- ---------- Fitness (mocked for the demo) ----------
create table fitness_connections (
  user_id uuid references profiles(id) on delete cascade,
  provider text not null,                      -- e.g. 'strava', 'apple_health'
  opted_in boolean not null default false,
  primary key (user_id, provider)
);

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table user_sports enable row level security;
alter table activities enable row level security;
alter table activity_participants enable row level security;
alter table activity_photos enable row level security;
alter table comments enable row level security;
alter table messages enable row level security;
alter table trusted_contacts enable row level security;
alter table safety_checkins enable row level security;
alter table fitness_connections enable row level security;
alter table sports enable row level security;

create policy "sports readable" on sports for select using (true);

create policy "profiles readable by signed-in users" on profiles for select using (auth.uid() is not null);
create policy "edit own profile" on profiles for update using (auth.uid() = id);

create policy "user_sports readable" on user_sports for select using (auth.uid() is not null);
create policy "manage own sports" on user_sports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "activities readable" on activities for select using (auth.uid() is not null);
create policy "host creates" on activities for insert with check (auth.uid() = host_id);
create policy "host edits" on activities for update using (auth.uid() = host_id);

create policy "participants readable" on activity_participants for select using (auth.uid() is not null);
create policy "join as yourself" on activity_participants for insert with check (auth.uid() = user_id);

create policy "photos readable" on activity_photos for select using (auth.uid() is not null);
create policy "post own photos" on activity_photos for insert with check (auth.uid() = user_id);

create policy "comments readable" on comments for select using (auth.uid() is not null);
create policy "post own comments" on comments for insert with check (auth.uid() = user_id);

-- Only participants and the host can read or send messages in an activity chat
create policy "chat read" on messages for select using (
  exists (select 1 from activity_participants p where p.activity_id = messages.activity_id and p.user_id = auth.uid())
  or exists (select 1 from activities a where a.id = messages.activity_id and a.host_id = auth.uid())
);
create policy "chat send" on messages for insert with check (
  auth.uid() = sender_id and (
    exists (select 1 from activity_participants p where p.activity_id = messages.activity_id and p.user_id = auth.uid())
    or exists (select 1 from activities a where a.id = messages.activity_id and a.host_id = auth.uid())
  )
);

create policy "own contacts only" on trusted_contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own safety checkins" on safety_checkins for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own fitness settings" on fitness_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Leaving goes through a function, not a direct UPDATE, so nobody can edit their own status/qr_token.
-- It also reopens the listing if the activity was full and now has room.
create or replace function leave_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from activity_participants   -- delete (not status='left') so the user can rejoin without a primary-key clash
   where activity_id = p_activity and user_id = auth.uid() and status = 'joined';
  if not found then
    raise exception 'You are not signed up for this activity';
  end if;
  update activities a set status = 'open'
   where a.id = p_activity and a.status = 'closed' and a.starts_at > now()
     and (select count(*) from activity_participants p where p.activity_id = a.id and p.status <> 'left') < a.max_participants;
end $$;

-- Realtime for group chat
alter publication supabase_realtime add table messages;
