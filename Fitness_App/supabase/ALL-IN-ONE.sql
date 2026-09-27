-- ============================================================
-- RALLY: ALL-IN-ONE DATABASE SETUP
-- Safe to run even if you already ran some of the earlier files.
-- Supabase SQL Editor -> New query -> paste everything -> Run.
-- (The 'destructive operations' warning is expected: it only replaces
--  old functions/policies with the new versions. No data is deleted.)
-- ============================================================


-- >>>>>>>>>> setup.sql
-- ============================================================
-- Additions to the existing schema (additive only, drops nothing)
-- Run in Supabase SQL Editor. Share with your teammate first.
-- ============================================================

-- 0. Remove older versions of these functions (return types may differ)
drop function if exists public.join_activity(uuid);
drop function if exists public.leave_activity(uuid);
drop function if exists public.my_qr_token(uuid);
drop function if exists public.host_check_in(uuid);

-- 1. Professional vs casual split (core to the pitch; activity_type only covers casual/team)
alter table activities add column if not exists category text not null default 'casual'
  check (category in ('casual', 'professional'));

-- Remembers whether the event closed because it filled up (so it can reopen if someone leaves)
alter table activities add column if not exists closed_by_cap boolean not null default false;

-- 2. Auto-create a profile on sign-up (safe even if a similar trigger already exists)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, is_verified, created_at)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'New user'), false, now())
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Joining goes through an RPC so the cap can't be bypassed.
--    The old direct-insert policy let anyone join closed/full events.
drop policy if exists "join as yourself" on activity_participants;

create or replace function public.join_activity(p_activity uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_act activities;
  v_count int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_act from activities where id = p_activity for update;
  if not found then raise exception 'Event not found'; end if;
  if v_act.host_id = auth.uid() then raise exception 'You are hosting this event'; end if;
  if v_act.status <> 'open' then raise exception 'This event is closed'; end if;
  if exists (select 1 from activity_participants
             where activity_id = p_activity and user_id = auth.uid() and status <> 'left') then
    raise exception 'You already joined this event';
  end if;

  select count(*) into v_count from activity_participants
    where activity_id = p_activity and status <> 'left';
  if v_count >= v_act.max_participants then raise exception 'This event is full'; end if;

  insert into activity_participants (activity_id, user_id, status, qr_token, joined_at)
  values (p_activity, auth.uid(), 'joined', gen_random_uuid(), now())
  on conflict (activity_id, user_id) do update
    set status = 'joined', qr_token = gen_random_uuid(), joined_at = now(), checked_in_at = null;

  v_count := v_count + 1;
  if v_count >= v_act.max_participants then
    update activities set status = 'closed', closed_by_cap = true where id = p_activity;
  end if;

  return v_count;
end; $$;

create or replace function public.leave_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update activity_participants set status = 'left'
    where activity_id = p_activity and user_id = auth.uid();
  update activities set status = 'open', closed_by_cap = false
    where id = p_activity and status = 'closed' and closed_by_cap;
end; $$;

-- 4. QR check-in. Each attendee shows their own QR; the host scans it.
--    qr_token is hidden from normal reads, otherwise anyone could copy someone else's code.
revoke select on activity_participants from anon, authenticated;
grant select (activity_id, user_id, status, joined_at, checked_in_at) on activity_participants to authenticated;

create or replace function public.my_qr_token(p_activity uuid) returns uuid
language sql security definer set search_path = public as $$
  select qr_token from activity_participants
  where activity_id = p_activity and user_id = auth.uid() and status <> 'left';
$$;

create or replace function public.host_check_in(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  update activity_participants p
     set status = 'checked_in', checked_in_at = now()
    from activities a
   where p.qr_token = p_token
     and a.id = p.activity_id
     and a.host_id = auth.uid()
     and p.status <> 'left';
  if not found then raise exception 'Invalid code, or this is not your event'; end if;

  select pr.full_name into v_name
    from activity_participants p join profiles pr on pr.id = p.user_id
   where p.qr_token = p_token;
  return v_name;
end; $$;

-- ============================================================
-- 5. Permissions the app needs (fixes the 401 on sports)
-- ============================================================
grant select on sports to anon, authenticated;
grant select on profiles to authenticated;
grant select, insert, update on activities to authenticated;

-- ============================================================
-- 6. Defaults for required columns the app doesn't send
-- ============================================================
alter table activities alter column corridor_radius_m set default 200;
alter table activities alter column checkin_interval_s set default 900;

-- ============================================================
-- 9. Profiles for users who signed up before the trigger existed
-- ============================================================
insert into profiles (id, full_name, is_verified, created_at)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), false, now()
from auth.users u
on conflict (id) do nothing;

-- ============================================================
-- 7. Link activities.host_id -> profiles (so the host's name loads)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_class r on r.oid = c.confrelid
    where t.relname = 'activities' and r.relname = 'profiles' and c.contype = 'f'
  ) then
    alter table activities add constraint activities_host_profile_fkey
      foreign key (host_id) references profiles(id);
  end if;
end $$;

-- ============================================================
-- 8. Seed sports (skips any that already exist)
-- ============================================================
insert into sports (name) values
  ('Cycling'), ('Running'), ('Basketball'), ('Hiking'), ('Badminton'),
  ('Tennis'), ('Football'), ('Flag Football'), ('Rugby'), ('Volleyball')
on conflict (name) do nothing;

-- Tell the API to reload the schema


-- >>>>>>>>>> social-setup.sql
-- ============================================================
-- Chat, comments and profile: permissions + links
-- Run once in Supabase SQL Editor (safe to run again)
-- ============================================================

-- Let signed-in users use these tables (row-level security policies still apply)
grant select, insert on comments to authenticated;
grant select, insert on messages to authenticated;
grant select, insert, delete on user_sports to authenticated;
grant update on profiles to authenticated;

-- Link author columns to profiles so names and avatars can load with each row
do $$
declare
  t text; col text;
begin
  for t, col in values ('comments', 'user_id'), ('messages', 'sender_id') loop
    if not exists (
      select 1 from pg_constraint c
      join pg_class tt on tt.oid = c.conrelid
      join pg_class r on r.oid = c.confrelid
      where tt.relname = t and r.relname = 'profiles' and c.contype = 'f'
    ) then
      execute format('alter table %I add constraint %I foreign key (%I) references profiles(id)', t, t || '_profile_fkey', col);
    end if;
  end loop;
end $$;

-- Instant chat updates (skips if already enabled)
do $$
begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
end $$;



-- >>>>>>>>>> reviews-policy.sql
-- ============================================================
-- Reviews: only real attendees, only after the event starts
-- Run once in Supabase SQL Editor (safe to run again)
-- ============================================================

-- Replace the old "anyone can comment anytime" rule
drop policy if exists "post own comments" on comments;
drop policy if exists "attendees review after event" on comments;

create policy "attendees review after event" on comments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from activities a
      where a.id = comments.activity_id
        and a.starts_at <= now()
        and (
          a.host_id = auth.uid()
          or exists (
            select 1 from activity_participants p
            where p.activity_id = a.id
              and p.user_id = auth.uid()
              and p.status = 'checked_in'
          )
        )
    )
  );

-- Optional: clear test comments posted before this rule existed


-- >>>>>>>>>> safety-setup.sql
-- ============================================================
-- Safety features: end time, emergency contacts, check-ins
-- Run once in Supabase SQL Editor BEFORE using the new code (safe to run again)
-- ============================================================

-- 1. Events get an end time (host picks a duration when creating)
alter table activities add column if not exists ends_at timestamptz;
update activities set ends_at = starts_at + interval '2 hours' where ends_at is null;

-- 2. Emergency contacts (private: the existing policy only lets you see your own)
grant select, insert, delete on trusted_contacts to authenticated;

-- 3. Safety check-ins ("I'm safe" / "Need help" / no response)
grant select, insert on safety_checkins to authenticated;

-- The host can see check-ins for their own event
drop policy if exists "host sees safety checkins" on safety_checkins;
create policy "host sees safety checkins" on safety_checkins
  for select to authenticated
  using (exists (select 1 from activities a where a.id = safety_checkins.activity_id and a.host_id = auth.uid()));



-- >>>>>>>>>> checkout-setup.sql
-- ============================================================
-- "Leaving early" / checked out status for safety check-ins
-- Run once in Supabase SQL Editor (safe to run again)
-- ============================================================
alter type safety_status add value if not exists 'checked_out';


-- >>>>>>>>>> features-setup.sql
-- ============================================================
-- Photos after events + accepting team challenges
-- Run once in Supabase SQL Editor BEFORE using the new code (safe to run again)
-- ============================================================

-- ---------- 1. Photos ----------
grant select, insert on activity_photos to authenticated;

-- Same rule as comments: only the host or people who checked in, once the event has started
drop policy if exists "post own photos" on activity_photos;
drop policy if exists "attendees post photos after start" on activity_photos;
create policy "attendees post photos after start" on activity_photos
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from activities a
      where a.id = activity_photos.activity_id
        and a.starts_at <= now()
        and (
          a.host_id = auth.uid()
          or exists (
            select 1 from activity_participants p
            where p.activity_id = a.id and p.user_id = auth.uid() and p.status = 'checked_in'
          )
        )
    )
  );

-- Public bucket for the images (files are stored as <event id>/<user id>/<time>.jpg)
insert into storage.buckets (id, name, public)
values ('activity-photos', 'activity-photos', true)
on conflict (id) do nothing;

drop policy if exists "upload own activity photos" on storage.objects;
create policy "upload own activity photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'activity-photos' and (storage.foldername(name))[2] = auth.uid()::text);

-- ---------- 2. Team challenges ----------
alter table activities add column if not exists challenger_id uuid references profiles(id);

-- Any signed-in player (not the host) can accept an open challenge with their team name
create or replace function public.accept_challenge(p_activity uuid, p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare v activities;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if coalesce(trim(p_team), '') = '' then raise exception 'Enter your team name'; end if;

  select * into v from activities where id = p_activity for update;
  if not found then raise exception 'Event not found'; end if;
  if v.type <> 'team' then raise exception 'This is not a team game'; end if;
  if v.host_id = auth.uid() then raise exception 'You are hosting this game'; end if;
  if v.opponent_team is not null then raise exception 'Another team already accepted this challenge'; end if;
  if v.status in ('cancelled', 'completed') then raise exception 'This game is over'; end if;

  update activities
     set opponent_team = left(trim(p_team), 60), challenger_id = auth.uid()
   where id = p_activity;
end; $$;


-- >>>>>>>>>> photo-reports.sql
-- ============================================================
-- Photo reports: anyone signed in can flag an event photo.
-- The host (or the uploader) can hide / restore it.
-- 3 reports from different people hide it automatically.
-- Run once in Supabase SQL Editor (safe to run again)
-- ============================================================

alter table activity_photos add column if not exists hidden boolean not null default false;

create table if not exists photo_reports (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references activity_photos(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (photo_id, reporter_id)
);
alter table photo_reports enable row level security;
grant select on photo_reports to authenticated;

-- Reporters see their own reports; the event host sees every report on their event's photos
drop policy if exists "see own or hosted reports" on photo_reports;
create policy "see own or hosted reports" on photo_reports
  for select to authenticated
  using (
    reporter_id = auth.uid()
    or exists (
      select 1 from activity_photos ph join activities a on a.id = ph.activity_id
      where ph.id = photo_reports.photo_id and a.host_id = auth.uid()
    )
  );

-- Flag a photo. Returns true if the photo is now hidden.
create or replace function public.report_photo(p_photo uuid, p_reason text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if not exists (select 1 from activity_photos where id = p_photo) then raise exception 'Photo not found'; end if;
  if exists (select 1 from activity_photos where id = p_photo and user_id = auth.uid()) then
    raise exception 'You can''t report your own photo';
  end if;

  insert into photo_reports (photo_id, reporter_id, reason)
  values (p_photo, auth.uid(), left(nullif(trim(p_reason), ''), 200))
  on conflict (photo_id, reporter_id) do nothing;

  select count(*) into n from photo_reports where photo_id = p_photo;
  if n >= 3 then update activity_photos set hidden = true where id = p_photo; end if;
  return n >= 3;
end; $$;

-- Hide or restore a photo (event host or the uploader only)
create or replace function public.set_photo_hidden(p_photo uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from activity_photos ph join activities a on a.id = ph.activity_id
    where ph.id = p_photo and (a.host_id = auth.uid() or ph.user_id = auth.uid())
  ) then raise exception 'Only the host or the uploader can do that'; end if;
  update activity_photos set hidden = p_hidden where id = p_photo;
end; $$;

grant execute on function public.report_photo(uuid, text) to authenticated;
grant execute on function public.set_photo_hidden(uuid, boolean) to authenticated;


-- >>>>>>>>>> privacy-setup.sql
-- ============================================================
-- Privacy: an event's comments, chat and photos are visible only to
-- its members (the host + people who joined and didn't leave).
-- Outsiders still see the event itself (title, time, place, who's going).
-- Run once in Supabase SQL Editor (safe to run again)
-- ============================================================

-- Is the signed-in user part of this event?
-- security definer so it can be used inside policies without RLS loops
create or replace function public.is_event_member(p_activity uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from activities a where a.id = p_activity and a.host_id = auth.uid())
      or exists (
        select 1 from activity_participants p
        where p.activity_id = p_activity and p.user_id = auth.uid() and p.status <> 'left'
      );
$$;
grant execute on function public.is_event_member(uuid) to authenticated;

-- Remove any old "anyone can read" rules on these tables (SELECT and ALL policies).
-- Our insert policies are FOR INSERT, so they stay.
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('comments', 'messages', 'activity_photos')
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

alter table comments enable row level security;
alter table messages enable row level security;
alter table activity_photos enable row level security;

create policy "members read comments" on comments
  for select to authenticated using (public.is_event_member(activity_id));

create policy "members read chat" on messages
  for select to authenticated using (public.is_event_member(activity_id));

-- Messages lost their ALL policy above if the old setup used one, so re-add sending
drop policy if exists "members send chat" on messages;
create policy "members send chat" on messages
  for insert to authenticated
  with check (auth.uid() = sender_id and public.is_event_member(activity_id));

-- Members see the event's photos. Hidden (reported) photos only show to the host and the uploader.
create policy "members read photos" on activity_photos
  for select to authenticated
  using (
    public.is_event_member(activity_id)
    and (
      coalesce(hidden, false) = false
      or user_id = auth.uid()
      or exists (select 1 from activities a where a.id = activity_id and a.host_id = auth.uid())
    )
  );

-- Photo files: bucket is no longer public; members get signed links
update storage.buckets set public = false where id = 'activity-photos';

drop policy if exists "members read activity photos" on storage.objects;
create policy "members read activity photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'activity-photos'
    and public.is_event_member(((storage.foldername(name))[1])::uuid)
  );


-- >>>>>>>>>> reliability-setup.sql
-- ============================================================
-- Reliability (show-up) score for PRO events
--   joined = finished pro events the player signed up for (and didn't leave before it started)
--   showed = of those, how many they actually checked in to with their QR code
-- Only visible to the player themself, or to the host of a pro event they're part of.
-- Run once in Supabase SQL Editor (safe to run again)
-- ============================================================

-- Remember when someone left, so leaving after the game started counts as a no-show
alter table activity_participants add column if not exists left_at timestamptz;
grant select (left_at) on activity_participants to authenticated;

create or replace function public.leave_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update activity_participants set status = 'left', left_at = now()
    where activity_id = p_activity and user_id = auth.uid() and status <> 'left';
  update activities set status = 'open', closed_by_cap = false
    where id = p_activity and status = 'closed' and closed_by_cap;
end; $$;

create or replace function public.reliability_scores(p_users uuid[])
returns table (user_id uuid, joined int, showed int)
language sql stable security definer set search_path = public as $$
  select u.id as user_id,
         count(p.activity_id)::int as joined,
         count(p.activity_id) filter (where p.status = 'checked_in' or p.checked_in_at is not null)::int as showed
  from unnest(p_users) as u(id)
  left join activity_participants p
    on p.user_id = u.id
   and (p.status <> 'left' or p.left_at >= (select a0.starts_at from activities a0 where a0.id = p.activity_id))
   and exists (
     select 1 from activities a
     where a.id = p.activity_id
       and a.category = 'professional'
       and a.status <> 'cancelled'
       and a.host_id <> u.id
       and (a.status = 'completed'
            or coalesce(a.ends_at, a.starts_at + interval '2 hours') + interval '30 minutes' < now())
   )
  where u.id = auth.uid()
     or exists (
       select 1 from activity_participants mp
       join activities ma on ma.id = mp.activity_id
       where mp.user_id = u.id and ma.host_id = auth.uid() and ma.category = 'professional'
     )
  group by u.id;
$$;
grant execute on function public.reliability_scores(uuid[]) to authenticated;


-- >>>>>>>>>> waitlist-setup.sql
-- ============================================================
-- Waitlist (casual) + join requests (pro)
--
-- CASUAL: when an event is full, people join the waitlist. If someone leaves
--   more than 30 min before the start, the first person in line is moved in
--   automatically and gets a notification. Closer than 30 min: no more moves
--   (not enough time to get there).
-- PRO: nobody joins directly. Players send a request; the host sees their
--   stats (show-up score, sports, games played) and approves or denies.
--
-- Needs reliability-setup.sql first. Run once (safe to run again).
-- ============================================================

create table if not exists join_requests (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('waitlist', 'request')),
  -- waiting -> promoted (waitlist moved in) | approved | denied | cancelled
  status text not null default 'waiting' check (status in ('waiting', 'promoted', 'approved', 'denied', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  seen boolean not null default false, -- requester has seen the outcome notification
  unique (activity_id, user_id)
);
create index if not exists join_requests_activity_idx on join_requests (activity_id, status, created_at);

alter table join_requests enable row level security;
grant select on join_requests to authenticated;

-- You see your own requests; hosts see requests for their events. All changes go through the functions below.
drop policy if exists "own or hosted requests" on join_requests;
create policy "own or hosted requests" on join_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from activities a where a.id = activity_id and a.host_id = auth.uid())
  );

-- ---------- helpers ----------

-- Adds a player to the event (same as a normal join) and closes sign-ups if it's now full
create or replace function public._seat_player(p_activity uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_max int; v_count int;
begin
  insert into activity_participants (activity_id, user_id, status, qr_token, joined_at)
  values (p_activity, p_user, 'joined', gen_random_uuid(), now())
  on conflict (activity_id, user_id) do update
    set status = 'joined', qr_token = gen_random_uuid(), joined_at = now(), checked_in_at = null, left_at = null;

  select max_participants into v_max from activities where id = p_activity;
  select count(*) into v_count from activity_participants where activity_id = p_activity and status <> 'left';
  if v_count >= v_max then
    update activities set status = 'closed', closed_by_cap = true where id = p_activity and status = 'open';
  end if;
end; $$;

-- Move people from the casual waitlist into open spots (only until 30 min before the start)
create or replace function public._promote_waitlist(p_activity uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v activities; v_count int; r record;
begin
  select * into v from activities where id = p_activity for update;
  if not found or v.category = 'professional' then return; end if;
  if v.status not in ('open', 'closed') or (v.status = 'closed' and not v.closed_by_cap) then return; end if;
  if now() > v.starts_at - interval '30 minutes' then return; end if;

  loop
    select count(*) into v_count from activity_participants where activity_id = p_activity and status <> 'left';
    exit when v_count >= v.max_participants;

    select * into r from join_requests
      where activity_id = p_activity and kind = 'waitlist' and status = 'waiting'
      order by created_at limit 1 for update skip locked;
    exit when not found;

    perform public._seat_player(p_activity, r.user_id);
    update join_requests set status = 'promoted', decided_at = now(), seen = false where id = r.id;
  end loop;
end; $$;
revoke execute on function public._seat_player(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._promote_waitlist(uuid) from public, anon, authenticated;

-- ---------- joining ----------

-- Casual events only. Pro events go through request_join.
create or replace function public.join_activity(p_activity uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_act activities;
  v_count int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_act from activities where id = p_activity for update;
  if not found then raise exception 'Event not found'; end if;
  if v_act.host_id = auth.uid() then raise exception 'You are hosting this event'; end if;
  if v_act.category = 'professional' then raise exception 'Pro events need the host''s approval. Send a request instead.'; end if;
  if v_act.status <> 'open' then raise exception 'This event is closed'; end if;
  if exists (select 1 from activity_participants
             where activity_id = p_activity and user_id = auth.uid() and status <> 'left') then
    raise exception 'You already joined this event';
  end if;

  -- Someone on the waitlist is ahead of you
  if exists (select 1 from join_requests where activity_id = p_activity and kind = 'waitlist' and status = 'waiting' and user_id <> auth.uid())
     and now() <= v_act.starts_at - interval '30 minutes' then
    perform public._promote_waitlist(p_activity);
    select * into v_act from activities where id = p_activity;
    if v_act.status <> 'open' then raise exception 'This event is full. Join the waitlist.'; end if;
  end if;

  select count(*) into v_count from activity_participants
    where activity_id = p_activity and status <> 'left';
  if v_count >= v_act.max_participants then raise exception 'This event is full. Join the waitlist.'; end if;

  perform public._seat_player(p_activity, auth.uid());
  update join_requests set status = 'cancelled' where activity_id = p_activity and user_id = auth.uid() and status = 'waiting';
  return v_count + 1;
end; $$;

-- Join the waitlist (casual, full) or send a request (pro). Returns 'waitlist' or 'request'.
create or replace function public.request_join(p_activity uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v activities; v_count int; v_kind text; v_prev text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into v from activities where id = p_activity;
  if not found then raise exception 'Event not found'; end if;
  if v.host_id = auth.uid() then raise exception 'You are hosting this event'; end if;
  if v.status in ('cancelled', 'completed') or now() >= v.starts_at then raise exception 'This event has already started'; end if;
  if exists (select 1 from activity_participants where activity_id = p_activity and user_id = auth.uid() and status <> 'left') then
    raise exception 'You are already in this event';
  end if;

  if v.category = 'professional' then
    if v.status = 'closed' and not v.closed_by_cap then raise exception 'The host closed sign-ups'; end if;
    v_kind := 'request';
    select status into v_prev from join_requests where activity_id = p_activity and user_id = auth.uid();
    if v_prev = 'denied' then raise exception 'The host already declined your request for this event'; end if;
  else
    if v.status = 'closed' and not v.closed_by_cap then raise exception 'The host closed sign-ups'; end if;
    select count(*) into v_count from activity_participants where activity_id = p_activity and status <> 'left';
    if v_count < v.max_participants and v.status = 'open' then raise exception 'There''s a spot open, just join!'; end if;
    if now() > v.starts_at - interval '30 minutes' then raise exception 'It starts too soon for the waitlist'; end if;
    v_kind := 'waitlist';
  end if;

  insert into join_requests (activity_id, user_id, kind, status)
  values (p_activity, auth.uid(), v_kind, 'waiting')
  on conflict (activity_id, user_id) do update
    set kind = excluded.kind, status = 'waiting', created_at = now(), decided_at = null, seen = false;
  return v_kind;
end; $$;

create or replace function public.cancel_request(p_activity uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update join_requests set status = 'cancelled', decided_at = now()
    where activity_id = p_activity and user_id = auth.uid() and status = 'waiting';
end; $$;

-- Leaving frees a spot: casual events pull in the next person from the waitlist
create or replace function public.leave_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update activity_participants set status = 'left', left_at = now()
    where activity_id = p_activity and user_id = auth.uid() and status <> 'left';
  update activities set status = 'open', closed_by_cap = false
    where id = p_activity and status = 'closed' and closed_by_cap;
  update join_requests set status = 'cancelled' where activity_id = p_activity and user_id = auth.uid();
  perform public._promote_waitlist(p_activity);
end; $$;

-- ---------- host: pro requests ----------

create or replace function public.decide_request(p_activity uuid, p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v activities; v_count int;
begin
  select * into v from activities where id = p_activity for update;
  if not found or v.host_id <> auth.uid() then raise exception 'Only the host can do that'; end if;
  if not exists (select 1 from join_requests where activity_id = p_activity and user_id = p_user and kind = 'request' and status = 'waiting') then
    raise exception 'That request is no longer pending';
  end if;

  if p_approve then
    if now() >= v.starts_at then raise exception 'This event has already started'; end if;
    select count(*) into v_count from activity_participants where activity_id = p_activity and status <> 'left';
    if v_count >= v.max_participants then raise exception 'The event is full. Someone has to leave first.'; end if;
    perform public._seat_player(p_activity, p_user);
    update join_requests set status = 'approved', decided_at = now(), seen = false where activity_id = p_activity and user_id = p_user;
  else
    update join_requests set status = 'denied', decided_at = now(), seen = false where activity_id = p_activity and user_id = p_user;
  end if;
end; $$;

-- What the host sees for each pending request: public stats only (no city, bio, contacts)
create or replace function public.request_list(p_activity uuid)
returns table (user_id uuid, full_name text, avatar_url text, is_verified boolean, requested_at timestamptz,
               sports jsonb, games_played int, pro_joined int, pro_showed int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from activities a where a.id = p_activity and a.host_id = auth.uid()) then
    raise exception 'Only the host can see requests';
  end if;
  return query
  select r.user_id, pr.full_name, pr.avatar_url, coalesce(pr.is_verified, false), r.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'level', us.level) order by s.name)
                   from user_sports us join sports s on s.id = us.sport_id where us.user_id = r.user_id), '[]'::jsonb),
         (select count(*)::int from activity_participants ap
           where ap.user_id = r.user_id and (ap.status = 'checked_in' or ap.checked_in_at is not null)),
         coalesce(rs.joined, 0), coalesce(rs.showed, 0)
  from join_requests r
  join profiles pr on pr.id = r.user_id
  left join lateral (
    select count(p.activity_id)::int as joined,
           count(p.activity_id) filter (where p.status = 'checked_in' or p.checked_in_at is not null)::int as showed
    from activity_participants p join activities a on a.id = p.activity_id
    where p.user_id = r.user_id and a.category = 'professional' and a.status <> 'cancelled' and a.host_id <> r.user_id
      and (p.status <> 'left' or p.left_at >= a.starts_at)
      and (a.status = 'completed' or coalesce(a.ends_at, a.starts_at + interval '2 hours') + interval '30 minutes' < now())
  ) rs on true
  where r.activity_id = p_activity and r.kind = 'request' and r.status = 'waiting'
  order by r.created_at;
end; $$;

-- Your place in line: { kind, status, position, waiting }
create or replace function public.my_request(p_activity uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kind', r.kind, 'status', r.status,
    'position', (select count(*) from join_requests o where o.activity_id = r.activity_id and o.kind = r.kind
                   and o.status = 'waiting' and o.created_at <= r.created_at),
    'waiting', (select count(*) from join_requests o where o.activity_id = r.activity_id and o.kind = r.kind and o.status = 'waiting'))
  from join_requests r where r.activity_id = p_activity and r.user_id = auth.uid();
$$;

-- Requester dismissed the "you're in / declined" notification
create or replace function public.mark_request_seen(p_activity uuid) returns void
language sql security definer set search_path = public as $$
  update join_requests set seen = true where activity_id = p_activity and user_id = auth.uid();
$$;

grant execute on function public.join_activity(uuid) to authenticated;
grant execute on function public.request_join(uuid) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.leave_activity(uuid) to authenticated;
grant execute on function public.decide_request(uuid, uuid, boolean) to authenticated;
grant execute on function public.request_list(uuid) to authenticated;
grant execute on function public.my_request(uuid) to authenticated;
grant execute on function public.mark_request_seen(uuid) to authenticated;


-- >>>>>>>>>> follow-setup.sql
-- ============================================================
-- Follow people you've played with
--   - one-way follow, no requests
--   - you can only follow someone you've shared an event with (it has started, you were both in it)
--   - you only ever see who YOU follow; nobody sees anyone else's follower list
-- Run once in Supabase SQL Editor (safe to run again)
-- ============================================================

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
alter table follows enable row level security;
grant select on follows to authenticated;

drop policy if exists "see who you follow" on follows;
create policy "see who you follow" on follows
  for select to authenticated using (follower_id = auth.uid());

-- Everyone you've been at an event with (host or player, event already started), most recent first
create or replace function public.played_with()
returns table (user_id uuid, full_name text, avatar_url text, is_verified boolean,
               games int, last_played timestamptz, following boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select a.id, a.starts_at
    from activities a
    where a.starts_at <= now() and a.status <> 'cancelled'
      and (a.host_id = auth.uid()
           or exists (select 1 from activity_participants p
                      where p.activity_id = a.id and p.user_id = auth.uid() and p.status <> 'left'))
  ),
  others as (
    select m.id, m.starts_at, p.user_id as uid
    from mine m join activity_participants p on p.activity_id = m.id and p.status <> 'left'
    union
    select m.id, m.starts_at, a.host_id
    from mine m join activities a on a.id = m.id
  )
  select o.uid, pr.full_name, pr.avatar_url, coalesce(pr.is_verified, false),
         count(distinct o.id)::int, max(o.starts_at),
         exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = o.uid)
  from others o join profiles pr on pr.id = o.uid
  where o.uid <> auth.uid()
  group by o.uid, pr.full_name, pr.avatar_url, pr.is_verified
  order by max(o.starts_at) desc
  limit 60;
$$;

create or replace function public.follow_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if p_user = auth.uid() then raise exception 'You can''t follow yourself'; end if;
  if not exists (select 1 from public.played_with() pw where pw.user_id = p_user) then
    raise exception 'You can follow people after you''ve played an event together';
  end if;
  insert into follows (follower_id, followee_id) values (auth.uid(), p_user) on conflict do nothing;
end; $$;

create or replace function public.unfollow_user(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from follows where follower_id = auth.uid() and followee_id = p_user;
$$;

grant execute on function public.played_with() to authenticated;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.unfollow_user(uuid) to authenticated;


-- >>>>>>>>>> friends-setup.sql
-- ============================================================
-- Friends page: see who follows you, follow back, or remove them
--   - only you can see your own followers (nobody else can)
--   - removing a follower also stops them from following you again
-- Needs follow-setup.sql first. Run once (safe to run again)
-- ============================================================

create table if not exists follow_blocks (
  user_id uuid not null references profiles(id) on delete cascade,     -- the person who removed
  blocked_id uuid not null references profiles(id) on delete cascade,  -- the follower they removed
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
alter table follow_blocks enable row level security;
-- no direct access; only used inside the functions below

-- People who follow me, with whether I follow them back
create or replace function public.my_followers()
returns table (user_id uuid, full_name text, avatar_url text, is_verified boolean, since timestamptz, following_back boolean)
language sql stable security definer set search_path = public as $$
  select f.follower_id, pr.full_name, pr.avatar_url, coalesce(pr.is_verified, false), f.created_at,
         exists (select 1 from follows b where b.follower_id = auth.uid() and b.followee_id = f.follower_id)
  from follows f join profiles pr on pr.id = f.follower_id
  where f.followee_id = auth.uid()
  order by f.created_at desc;
$$;

-- Remove someone who follows me (and stop them re-following)
create or replace function public.remove_follower(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from follows where follower_id = p_user and followee_id = auth.uid();
  insert into follow_blocks (user_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
$$;

-- Following now also respects removals, and allows following back anyone who follows you
create or replace function public.follow_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if p_user = auth.uid() then raise exception 'You can''t follow yourself'; end if;
  if exists (select 1 from follow_blocks where user_id = p_user and blocked_id = auth.uid()) then
    raise exception 'You can''t follow this person';
  end if;
  if not exists (select 1 from public.played_with() pw where pw.user_id = p_user)
     and not exists (select 1 from follows where follower_id = p_user and followee_id = auth.uid()) then
    raise exception 'You can follow people after you''ve played an event together';
  end if;
  -- following someone you removed earlier lifts your own block on them
  delete from follow_blocks where user_id = auth.uid() and blocked_id = p_user;
  insert into follows (follower_id, followee_id) values (auth.uid(), p_user) on conflict do nothing;
end; $$;

grant execute on function public.my_followers() to authenticated;
grant execute on function public.remove_follower(uuid) to authenticated;
grant execute on function public.follow_user(uuid) to authenticated;


-- >>>>>>>>>> dm-setup.sql
-- ============================================================
-- Direct messages between friends
--   - you can only message a FRIEND (you follow each other), so no stranger DMs
--   - only the two people in a conversation can read it
--   - a message can carry an event (activity_id) to plan games together
-- Needs follow-setup.sql + friends-setup.sql first. Run once (safe to run again)
-- ============================================================

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  body text not null default '',
  activity_id uuid references activities(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id),
  check (length(body) <= 2000)
);
create index if not exists dm_pair_idx on direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);
create index if not exists dm_unread_idx on direct_messages (recipient_id) where read_at is null;

alter table direct_messages enable row level security;
grant select on direct_messages to authenticated;

drop policy if exists "read own conversations" on direct_messages;
create policy "read own conversations" on direct_messages
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Instant delivery (Realtime respects the policy above)
do $$
begin
  alter publication supabase_realtime add table direct_messages;
exception when duplicate_object then null; when undefined_object then null;
end $$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from follows where follower_id = a and followee_id = b)
     and exists (select 1 from follows where follower_id = b and followee_id = a);
$$;

create or replace function public.send_dm(p_to uuid, p_body text, p_activity uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if v_body = '' and p_activity is null then raise exception 'Type a message'; end if;
  if not public.are_friends(auth.uid(), p_to) then
    raise exception 'You can only message friends (people who follow you back)';
  end if;
  insert into direct_messages (sender_id, recipient_id, body, activity_id)
  values (auth.uid(), p_to, left(v_body, 2000), p_activity)
  returning id into v_id;
  return v_id;
end; $$;

-- Mark everything from this person as read
create or replace function public.mark_dm_read(p_from uuid) returns void
language sql security definer set search_path = public as $$
  update direct_messages set read_at = now()
  where recipient_id = auth.uid() and sender_id = p_from and read_at is null;
$$;

-- One row per conversation: the other person, last message, unread count, still friends?
create or replace function public.dm_threads()
returns table (user_id uuid, full_name text, avatar_url text, last_body text, last_activity uuid,
               last_at timestamptz, last_from_me boolean, unread int, can_message boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when sender_id = auth.uid() then recipient_id else sender_id end as other, *
    from direct_messages
    where sender_id = auth.uid() or recipient_id = auth.uid()
  ),
  latest as (
    select distinct on (other) other, body, activity_id, created_at, sender_id = auth.uid() as from_me
    from mine order by other, created_at desc
  )
  select l.other, pr.full_name, pr.avatar_url, l.body, l.activity_id, l.created_at, l.from_me,
         (select count(*)::int from direct_messages d where d.sender_id = l.other and d.recipient_id = auth.uid() and d.read_at is null),
         public.are_friends(auth.uid(), l.other)
  from latest l join profiles pr on pr.id = l.other
  order by l.created_at desc;
$$;

grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.send_dm(uuid, text, uuid) to authenticated;
grant execute on function public.mark_dm_read(uuid) to authenticated;
grant execute on function public.dm_threads() to authenticated;


-- >>>>>>>>>> avatars-setup.sql
-- ============================================================
-- Profile pictures
--   bucket "avatars" (public, so pictures show in lists, chat, etc.)
--   each user can only upload / replace / delete files in their own folder: avatars/<user id>/...
-- Run once in Supabase SQL Editor (safe to run again)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "update own avatar" on storage.objects;
create policy "update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Needed to list your own old pictures so they can be cleaned up
drop policy if exists "list own avatars" on storage.objects;
create policy "list own avatars" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);


-- >>>>>>>>>> eligibility-setup.sql
-- ============================================================
-- Eligibility: date of birth + gender (private) and age-group / gender-specific events
--   - DOB and gender live in private_details, readable ONLY by the owner
--     (the public profiles table never holds them)
--   - the app is 18+
--   - hosts can set "Who can join" (open / women / men / women & non-binary) and an age group
--   - joining, requesting and approving all check eligibility in the database
-- Needs waitlist-setup.sql first. Run once (safe to run again)
-- ============================================================

create table if not exists private_details (
  user_id uuid primary key references profiles(id) on delete cascade,
  birth_date date,
  gender text check (gender in ('woman', 'man', 'non_binary', 'prefer_not')),
  updated_at timestamptz not null default now()
);
alter table private_details enable row level security;
grant select on private_details to authenticated;

drop policy if exists "only you see your details" on private_details;
create policy "only you see your details" on private_details
  for select to authenticated using (user_id = auth.uid());

-- Save your own DOB / gender (18+ only)
create or replace function public.set_my_details(p_birth date, p_gender text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if p_birth is not null and p_birth > (current_date - interval '18 years')::date then
    raise exception 'You need to be 18 or older to use Rally';
  end if;
  if p_birth is not null and p_birth < (current_date - interval '110 years')::date then
    raise exception 'Please check your date of birth';
  end if;
  if p_gender is not null and p_gender not in ('woman', 'man', 'non_binary', 'prefer_not') then
    raise exception 'Unknown gender option';
  end if;
  insert into private_details (user_id, birth_date, gender, updated_at)
  values (auth.uid(), p_birth, p_gender, now())
  on conflict (user_id) do update
    set birth_date = coalesce(excluded.birth_date, private_details.birth_date),
        gender = coalesce(excluded.gender, private_details.gender),
        updated_at = now();
end; $$;

-- Event settings
alter table activities add column if not exists gender_rule text not null default 'open';
alter table activities add column if not exists age_min int;
alter table activities add column if not exists age_max int;
do $$ begin
  alter table activities add constraint activities_gender_rule_check check (gender_rule in ('open', 'women', 'men', 'women_nb'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table activities add constraint activities_age_check
    check ((age_min is null or age_min between 18 and 120) and (age_max is null or age_max between 18 and 120)
           and (age_min is null or age_max is null or age_min <= age_max));
exception when duplicate_object then null; end $$;

-- Why this person can't join this event (null = they can)
create or replace function public.eligibility_error(p_activity uuid, p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v activities; d private_details; v_age int;
begin
  select * into v from activities where id = p_activity;
  if not found or v.host_id = p_user then return null; end if;
  if v.gender_rule = 'open' and v.age_min is null and v.age_max is null then return null; end if;

  select * into d from private_details where user_id = p_user;

  if v.age_min is not null or v.age_max is not null then
    if d.birth_date is null then return 'Add your date of birth on your profile to join age-group events'; end if;
    v_age := date_part('year', age(v.starts_at::date, d.birth_date));
    if v.age_min is not null and v_age < v.age_min then
      return format('This event is for ages %s%s', v.age_min, coalesce('–' || v.age_max, '+'));
    end if;
    if v.age_max is not null and v_age > v.age_max then
      return format('This event is for ages %s–%s', coalesce(v.age_min, 18), v.age_max);
    end if;
  end if;

  if v.gender_rule <> 'open' then
    if d.gender is null or d.gender = 'prefer_not' then
      return 'Add your gender on your profile to join this event';
    end if;
    if v.gender_rule = 'women' and d.gender <> 'woman' then return 'This is a women''s event'; end if;
    if v.gender_rule = 'men' and d.gender <> 'man' then return 'This is a men''s event'; end if;
    if v.gender_rule = 'women_nb' and d.gender not in ('woman', 'non_binary') then
      return 'This event is for women and non-binary players';
    end if;
  end if;
  return null;
end; $$;

-- Can I join? (null = yes, otherwise the reason) — for the Join button
create or replace function public.my_eligibility(p_activity uuid) returns text
language sql stable security definer set search_path = public as $$
  select public.eligibility_error(p_activity, auth.uid());
$$;

-- Joining / requesting / approving now check eligibility (same as waitlist-setup.sql + the check)
create or replace function public.join_activity(p_activity uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_act activities;
  v_count int;
  v_err text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_act from activities where id = p_activity for update;
  if not found then raise exception 'Event not found'; end if;
  if v_act.host_id = auth.uid() then raise exception 'You are hosting this event'; end if;
  if v_act.category = 'professional' then raise exception 'Pro events need the host''s approval. Send a request instead.'; end if;
  if v_act.status <> 'open' then raise exception 'This event is closed'; end if;
  v_err := public.eligibility_error(p_activity, auth.uid());
  if v_err is not null then raise exception '%', v_err; end if;
  if exists (select 1 from activity_participants
             where activity_id = p_activity and user_id = auth.uid() and status <> 'left') then
    raise exception 'You already joined this event';
  end if;

  -- Someone on the waitlist is ahead of you
  if exists (select 1 from join_requests where activity_id = p_activity and kind = 'waitlist' and status = 'waiting' and user_id <> auth.uid())
     and now() <= v_act.starts_at - interval '30 minutes' then
    perform public._promote_waitlist(p_activity);
    select * into v_act from activities where id = p_activity;
    if v_act.status <> 'open' then raise exception 'This event is full. Join the waitlist.'; end if;
  end if;

  select count(*) into v_count from activity_participants
    where activity_id = p_activity and status <> 'left';
  if v_count >= v_act.max_participants then raise exception 'This event is full. Join the waitlist.'; end if;

  perform public._seat_player(p_activity, auth.uid());
  update join_requests set status = 'cancelled' where activity_id = p_activity and user_id = auth.uid() and status = 'waiting';
  return v_count + 1;
end; $$;

create or replace function public.request_join(p_activity uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v activities; v_count int; v_kind text; v_prev text; v_err text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into v from activities where id = p_activity;
  if not found then raise exception 'Event not found'; end if;
  if v.host_id = auth.uid() then raise exception 'You are hosting this event'; end if;
  if v.status in ('cancelled', 'completed') or now() >= v.starts_at then raise exception 'This event has already started'; end if;
  if exists (select 1 from activity_participants where activity_id = p_activity and user_id = auth.uid() and status <> 'left') then
    raise exception 'You are already in this event';
  end if;
  v_err := public.eligibility_error(p_activity, auth.uid());
  if v_err is not null then raise exception '%', v_err; end if;

  if v.category = 'professional' then
    if v.status = 'closed' and not v.closed_by_cap then raise exception 'The host closed sign-ups'; end if;
    v_kind := 'request';
    select status into v_prev from join_requests where activity_id = p_activity and user_id = auth.uid();
    if v_prev = 'denied' then raise exception 'The host already declined your request for this event'; end if;
  else
    if v.status = 'closed' and not v.closed_by_cap then raise exception 'The host closed sign-ups'; end if;
    select count(*) into v_count from activity_participants where activity_id = p_activity and status <> 'left';
    if v_count < v.max_participants and v.status = 'open' then raise exception 'There''s a spot open, just join!'; end if;
    if now() > v.starts_at - interval '30 minutes' then raise exception 'It starts too soon for the waitlist'; end if;
    v_kind := 'waitlist';
  end if;

  insert into join_requests (activity_id, user_id, kind, status)
  values (p_activity, auth.uid(), v_kind, 'waiting')
  on conflict (activity_id, user_id) do update
    set kind = excluded.kind, status = 'waiting', created_at = now(), decided_at = null, seen = false;
  return v_kind;
end; $$;

create or replace function public.decide_request(p_activity uuid, p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v activities; v_count int; v_err text;
begin
  select * into v from activities where id = p_activity for update;
  if not found or v.host_id <> auth.uid() then raise exception 'Only the host can do that'; end if;
  if not exists (select 1 from join_requests where activity_id = p_activity and user_id = p_user and kind = 'request' and status = 'waiting') then
    raise exception 'That request is no longer pending';
  end if;

  if p_approve then
    if now() >= v.starts_at then raise exception 'This event has already started'; end if;
    v_err := public.eligibility_error(p_activity, p_user);
    if v_err is not null then raise exception 'Can''t approve: %', v_err; end if;
    select count(*) into v_count from activity_participants where activity_id = p_activity and status <> 'left';
    if v_count >= v.max_participants then raise exception 'The event is full. Someone has to leave first.'; end if;
    perform public._seat_player(p_activity, p_user);
    update join_requests set status = 'approved', decided_at = now(), seen = false where activity_id = p_activity and user_id = p_user;
  else
    update join_requests set status = 'denied', decided_at = now(), seen = false where activity_id = p_activity and user_id = p_user;
  end if;
end; $$;

grant execute on function public.set_my_details(date, text) to authenticated;
grant execute on function public.my_eligibility(uuid) to authenticated;
grant execute on function public.join_activity(uuid) to authenticated;
grant execute on function public.request_join(uuid) to authenticated;
grant execute on function public.decide_request(uuid, uuid, boolean) to authenticated;
revoke execute on function public.eligibility_error(uuid, uuid) from public, anon, authenticated;


-- >>>>>>>>>> more-sports.sql
-- ============================================================
-- More sports and activities to pick from when hosting
-- Safe to run again (skips any that already exist)
-- ============================================================
insert into sports (name) values
  ('Pickleball'), ('Table Tennis'), ('Squash'), ('Golf'), ('Ultimate Frisbee'),
  ('Baseball'), ('Softball'), ('Cricket'), ('Hockey'), ('Ice Skating'),
  ('Swimming'), ('Yoga'), ('Climbing'), ('Walking'), ('Trail Running'),
  ('Skiing'), ('Kayaking'), ('Rowing'), ('Skateboarding'), ('Boxing'),
  ('Martial Arts'), ('Dance'), ('Gym Workout'), ('Bowling'), ('Disc Golf'), ('Spikeball')
on conflict (name) do nothing;


-- >>>>>>>>>> host-gender-rule.sql
-- ============================================================
-- Hosts of gender-specific events must fit the rule themselves
-- (a women's event can only be hosted by a woman, etc.). Age groups are open to any host,
-- since coaches and organisers often run groups they're not in.
-- Needs eligibility-setup.sql first. Run once (safe to run again)
-- ============================================================

create or replace function public.check_host_gender() returns trigger
language plpgsql security definer set search_path = public as $$
declare g text;
begin
  if new.gender_rule is null or new.gender_rule = 'open' then return new; end if;
  select gender into g from private_details where user_id = new.host_id;
  if g is null or g = 'prefer_not' then
    raise exception 'Set your gender in Private details on your profile to host a % event',
      case new.gender_rule when 'women' then 'women''s' when 'men' then 'men''s' else 'women & non-binary' end;
  end if;
  if (new.gender_rule = 'women' and g <> 'woman')
     or (new.gender_rule = 'men' and g <> 'man')
     or (new.gender_rule = 'women_nb' and g not in ('woman', 'non_binary')) then
    raise exception 'You can only host gender-specific events you could join yourself';
  end if;
  return new;
end; $$;

drop trigger if exists host_gender_rule on activities;
create trigger host_gender_rule
  before insert or update of gender_rule, host_id on activities
  for each row execute function public.check_host_gender();


-- >>>>>>>>>> gender-lock.sql
-- ============================================================
-- Gender is locked once set
--   Not set / Prefer not to say -> Woman, Man or Non-binary: allowed (first choice)
--   After that: can't be changed from the app (stops switching just to get into an event)
-- Needs eligibility-setup.sql first. Run once (safe to run again)
-- ============================================================
create or replace function public.set_my_details(p_birth date, p_gender text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if p_birth is not null and p_birth > (current_date - interval '18 years')::date then
    raise exception 'You need to be 18 or older to use Rally';
  end if;
  if p_birth is not null and p_birth < (current_date - interval '110 years')::date then
    raise exception 'Please check your date of birth';
  end if;
  if p_gender is not null and p_gender not in ('woman', 'man', 'non_binary', 'prefer_not') then
    raise exception 'Unknown gender option';
  end if;

  select gender into cur from private_details where user_id = auth.uid();
  if cur in ('woman', 'man', 'non_binary') and p_gender is not null and p_gender <> cur then
    raise exception 'Your gender is locked once set. Contact support if it needs to change.';
  end if;

  insert into private_details (user_id, birth_date, gender, updated_at)
  values (auth.uid(), p_birth, p_gender, now())
  on conflict (user_id) do update
    set birth_date = coalesce(excluded.birth_date, private_details.birth_date),
        gender = coalesce(excluded.gender, private_details.gender),
        updated_at = now();
end; $$;

grant execute on function public.set_my_details(date, text) to authenticated;
notify pgrst, 'reload schema';
