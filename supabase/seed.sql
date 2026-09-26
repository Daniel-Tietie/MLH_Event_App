-- Rally demo seed: Fredericton, NB. Re-runnable: wipes and recreates only @rally.demo users (and their activities).
-- Run right before the demo so start times are in the future. Coordinates are approximate.
-- All seed accounts share one demo password (set below) so you can log in as any of them.

delete from auth.users where email like '%@rally.demo';   -- cascades to profiles, activities, participants

-- ---------- 6 users (inserting into auth.users fires handle_new_user -> profiles row) ----------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated', v.email,
  crypt('demo1234', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v.name),
  now(), now(), '', '', '', ''
from (values
  ('b0000000-0000-0000-0000-000000000001', 'maya@rally.demo',  'Maya Chen'),
  ('b0000000-0000-0000-0000-000000000002', 'liam@rally.demo',  'Liam Murphy'),
  ('b0000000-0000-0000-0000-000000000003', 'priya@rally.demo', 'Priya Nair'),
  ('b0000000-0000-0000-0000-000000000004', 'noah@rally.demo',  'Noah Tremblay'),
  ('b0000000-0000-0000-0000-000000000005', 'aisha@rally.demo', 'Aisha Bello'),
  ('b0000000-0000-0000-0000-000000000006', 'ethan@rally.demo', 'Ethan MacDonald')
) as v(id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users where email like '%@rally.demo';

-- Fill in profile details (mock ID verification: seed users are pre-verified)
update profiles p set
  city = 'Fredericton',
  location = st_setsrid(st_makepoint(-66.6431, 45.9636), 4326)::geography,
  is_verified = true,
  bio = v.bio
from (values
  ('b0000000-0000-0000-0000-000000000001', 'Trail runner and weekend cyclist. Always up for an easy pace and a coffee after.'),
  ('b0000000-0000-0000-0000-000000000002', 'Played rugby and football back home. Now mostly pickup basketball.'),
  ('b0000000-0000-0000-0000-000000000003', 'Hiker and badminton player. I organize the evening walks.'),
  ('b0000000-0000-0000-0000-000000000004', 'Tennis and running. New to Fredericton, looking for people to play with.'),
  ('b0000000-0000-0000-0000-000000000005', 'Badminton, running, and the occasional 5-a-side game.'),
  ('b0000000-0000-0000-0000-000000000006', 'Road cyclist. Sunday loops along the river.')
) as v(id, bio)
where p.id = v.id::uuid;

-- ---------- Sports and levels ----------
insert into user_sports (user_id, sport_id, level)
select v.uid::uuid, s.id, v.lvl::sport_level
from (values
  ('b0000000-0000-0000-0000-000000000001', 'Running',    'competitive'),
  ('b0000000-0000-0000-0000-000000000001', 'Cycling',    'casual'),
  ('b0000000-0000-0000-0000-000000000002', 'Basketball', 'casual'),
  ('b0000000-0000-0000-0000-000000000002', 'Rugby',      'ex_player'),
  ('b0000000-0000-0000-0000-000000000002', 'Football',   'retired'),
  ('b0000000-0000-0000-0000-000000000003', 'Hiking',     'casual'),
  ('b0000000-0000-0000-0000-000000000003', 'Badminton',  'competitive'),
  ('b0000000-0000-0000-0000-000000000004', 'Tennis',     'competitive'),
  ('b0000000-0000-0000-0000-000000000004', 'Running',    'casual'),
  ('b0000000-0000-0000-0000-000000000005', 'Badminton',  'd1'),
  ('b0000000-0000-0000-0000-000000000005', 'Football',   'casual'),
  ('b0000000-0000-0000-0000-000000000006', 'Cycling',    'competitive'),
  ('b0000000-0000-0000-0000-000000000006', 'Football',   'd2')
) as v(uid, sport, lvl)
join sports s on s.name = v.sport;

-- ---------- 10 activities around Fredericton ----------
-- max_participants = companions the host wants (host not counted). Start times are relative to now().
insert into activities (id, host_id, sport_id, title, description, type, opponent_team, city, address, location, starts_at, max_participants)
select v.id::uuid, v.host::uuid, s.id, v.title, v.descr, v.typ::activity_type, v.opp, 'Fredericton', v.addr,
       st_setsrid(st_makepoint(v.lng, v.lat), 4326)::geography, now() + v.starts::interval, v.cap
from (values
  ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Running',   'Riverfront easy 5K',            'Relaxed pace along the Saint John River trail. All levels welcome.', 'casual', null, 'Downtown waterfront trail',   45.9650, -66.6450, '26 hours',  8),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','Basketball','Pickup basketball at UNB',       'Half-court games, we rotate teams. Bring water.',                     'casual', null, 'UNB campus gym area',        45.9483, -66.6405, '30 hours', 10),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','Hiking',    'Odell Park loop hike',           'About 2 hours through the forest trails. Good shoes recommended.',    'casual', null, 'Odell Park',                 45.9497, -66.6767, '32 hours',  6),
  ('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000006','Cycling',   'Sunday river loop ride',         '40 km, steady pace, one coffee stop. Helmet required.',               'casual', null, 'Officers Square',            45.9620, -66.6480, '48 hours',  6),
  ('a0000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000005','Badminton', 'Badminton doubles night',        'Friendly doubles, rackets provided if you need one.',                 'casual', null, 'UNB courts',                 45.9455, -66.6410, '50 hours',  4),
  ('a0000000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000004','Tennis',    'Tennis rally practice',          'Hitting session, intermediate level.',                                'casual', null, 'Nashwaaksis courts',         45.9900, -66.6200, '54 hours',  3),
  ('a0000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000002','Football',  'Friendly: UNB crew vs Downtown FC','Team challenge, 7-a-side. Come as a team or join ours.',            'team',   'Downtown FC', 'South field',               45.9440, -66.6360, '72 hours', 10),
  ('a0000000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000003','Hiking',    'Evening riverside safety walk',  'Guided night walk with live location sharing and a check-in every 5 minutes.', 'casual', null, 'Downtown waterfront',  45.9640, -66.6470, '50 hours',  6),
  ('a0000000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000004','Running',   'Killarney Lake trail run',       'Loop around the lake, moderate pace.',                                'casual', null, 'Killarney Lake',             45.9147, -66.6950, '96 hours',  8),
  ('a0000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000001','Cycling',   'Oromocto weekend ride',          'Longer ride out of town, about 60 km round trip.',                    'casual', null, 'Oromocto',                   45.8490, -66.4780, '120 hours',10)
) as v(id, host, sport, title, descr, typ, opp, addr, lat, lng, starts, cap)
join sports s on s.name = v.sport;

-- Night-walk settings for the safety demo (activity 8): route along the river, 75 m corridor, check-in every 5 min
update activities set
  night_mode = true,
  corridor_radius_m = 75,
  checkin_interval_s = 300,
  route = st_geogfromtext('SRID=4326;LINESTRING(-66.6500 45.9625, -66.6470 45.9640, -66.6440 45.9655, -66.6400 45.9660, -66.6360 45.9650)')
where id = 'a0000000-0000-0000-0000-000000000008';

-- ---------- Participants (goes through the cap trigger, like real joins) ----------
insert into activity_participants (activity_id, user_id)
select v.a::uuid, v.u::uuid from (values
  ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000006'),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000002'),
  -- activity 4: cap 6, 5 joined = ONE SPOT LEFT (the live "join and watch it close" demo)
  ('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000006'),
  ('a0000000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000006')
) as v(a, u);
