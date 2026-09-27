-- ============================================================
-- Demo events for the map (run AFTER setup.sql)
-- 1. Change YOUR_EMAIL to the email you sign in with
-- 2. Change the center + city to where the hackathon is
--    (Google Maps: right-click a spot -> click the coordinates to copy them)
-- ============================================================
do $$
declare
  host_email text := 'YOUR_EMAIL@example.com';
  center_lat float := 45.9636;     -- Fredericton, NB
  center_lng float := -66.6431;
  city_name text := 'Fredericton';
  host uuid;
begin
  select id into host from auth.users where email = host_email;
  if host is null then
    raise exception 'No user with email %. Sign up in the app first, then use that email here.', host_email;
  end if;

  insert into activities (
    host_id, sport_id, title, description, type, category, opponent_team,
    city, address, location, starts_at, max_participants, status, night_mode
  )
  select
    host, s.id, v.title, v.descr, v.kind::activity_type, v.cat, v.opp,
    city_name, v.addr,
    format('SRID=4326;POINT(%s %s)', center_lng + v.dlng, center_lat + v.dlat)::geography,
    date_trunc('hour', now()) + v.hours * interval '1 hour',
    v.cap, 'open', v.night
  from (values
    ('Cycling',    'Saturday morning river ride', 'Easy 25 km loop along the river. Helmets required, coffee after.', 'casual', 'casual',       null,             'Walking Bridge',   0.003,  0.004,  20, 8,  false),
    ('Basketball', '5v5 pickup, competitive',     'Full court, ex-college players welcome.',                            'team',   'professional', 'Campus Ballers', 'University gym',  -0.017,  0.002,  46, 10, false),
    ('Running',    'Night 10K tempo run',         'Well-lit downtown route, 5:30/km pace.',                             'casual', 'casual',       null,             'Downtown square', -0.003, -0.001,  28, 6,  true),
    ('Hiking',     'Trail hike + picnic',         'Beginner-friendly 6 km loop. Bring water.',                          'casual', 'casual',       null,             'City park trails',-0.011, -0.028,  70, 12, false),
    ('Tennis',     'Doubles tennis mixer',        'Rotating doubles, all levels. Rackets available.',                   'casual', 'casual',       null,             'Public courts',   -0.006, -0.010,  25, 4,  false),
    ('Badminton',  'Competitive badminton night', 'Singles ladder, D1/D2 and ex-players.',                              'casual', 'professional', null,             'Community centre', 0.012,  0.015,  50, 8,  false)
  ) as v(sport, title, descr, kind, cat, opp, addr, dlat, dlng, hours, cap, night)
  join sports s on s.name = v.sport;
end $$;
