-- Rally: QR token hardening. Run AFTER schema.sql and map_patch.sql.
-- Goal: nobody can read anyone else's QR token, so nobody can show another person's code at check-in.

-- Column-level privileges: signed-in users can read every column of activity_participants EXCEPT qr_token.
-- (Postgres can only hide a column by granting the others explicitly, so `select *` on this table now fails on purpose.)
revoke select on activity_participants from anon, authenticated;
grant select (activity_id, user_id, status, joined_at, checked_in_at) on activity_participants to authenticated;

-- All writes go through functions (join_activity, leave_activity, check_in), never direct table writes.
revoke insert, update, delete on activity_participants from anon, authenticated;

-- Join, and get back only your own token. SECURITY DEFINER is needed because you cannot read qr_token yourself;
-- it always inserts auth.uid(), so you can only ever join as yourself. The cap trigger still fires.
create or replace function join_activity(p_activity uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first';
  end if;
  insert into activity_participants (activity_id, user_id)
  values (p_activity, auth.uid())
  returning qr_token into v_token;
  return v_token;
end $$;

-- Your own token for an activity (null if you have not joined).
create or replace function my_qr_token(p_activity uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select qr_token from activity_participants where activity_id = p_activity and user_id = auth.uid();
$$;
