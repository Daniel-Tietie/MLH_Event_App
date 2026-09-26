-- Rally: radius search + live night-walk map. Run AFTER schema.sql.

-- ---------- New activity columns ----------
alter table activities
  add column route geography(linestring, 4326),                                   -- planned walking route
  add column corridor_radius_m int not null default 100 check (corridor_radius_m > 0), -- how far off-route before an alert
  add column night_mode boolean not null default false,
  add column checkin_interval_s int not null default 300 check (checkin_interval_s >= 30);

-- ---------- Live locations: one row per person per activity (latest position, upserted) ----------
create table live_locations (
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  position geography(point, 4326) not null,
  updated_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table geofence_alerts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  meters_outside float not null,
  created_at timestamptz not null default now()
);
create index geofence_alerts_activity_idx on geofence_alerts (activity_id, created_at desc);

-- ---------- RLS: only the host and current participants see locations/alerts ----------
alter table live_locations enable row level security;
alter table geofence_alerts enable row level security;

create or replace function is_activity_member(p_activity uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from activities a where a.id = p_activity and a.host_id = auth.uid())
      or exists (select 1 from activity_participants p
                 where p.activity_id = p_activity and p.user_id = auth.uid() and p.status <> 'left');
$$;

create policy "members see live locations" on live_locations for select using (is_activity_member(activity_id));
create policy "share own location" on live_locations for insert
  with check (auth.uid() = user_id and is_activity_member(activity_id));
create policy "update own location" on live_locations for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id and is_activity_member(activity_id));
create policy "stop sharing" on live_locations for delete using (auth.uid() = user_id);
create policy "members see alerts" on geofence_alerts for select using (is_activity_member(activity_id));
-- no insert policy on geofence_alerts: only the trigger below writes to it

-- ---------- Geofence: the database flags anyone who strays from the route corridor ----------
create or replace function flag_geofence() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  r geography;
  corridor int;
  d float;
begin
  select route, corridor_radius_m into r, corridor from activities where id = new.activity_id;
  if r is null then return new; end if;
  d := ST_Distance(r, new.position);           -- metres from the route line
  if d > corridor then
    insert into geofence_alerts (activity_id, user_id, meters_outside)
    values (new.activity_id, new.user_id, d - corridor);
  end if;
  return new;
end $$;

create trigger live_location_geofence
  after insert or update of position on live_locations
  for each row execute function flag_geofence();

alter publication supabase_realtime add table live_locations, geofence_alerts;

-- ---------- Radius search: what the browse page and map call ----------
drop function if exists activities_nearby(float, float, float);
create function activities_nearby(p_lat float, p_lng float, p_radius_km float)
returns table (
  id uuid, host_id uuid, host_name text, sport_id int, sport_name text,
  title text, description text, type activity_type, opponent_team text,
  city text, address text, starts_at timestamptz,
  max_participants int, joined_count int, spots_left int,
  status activity_status, night_mode boolean,
  lat float, lng float, distance_km float
)
language sql stable set search_path = public, extensions as $$
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
