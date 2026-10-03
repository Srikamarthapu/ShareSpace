-- Access rules for the v1 schema. Synthetic rows only; everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Users: a1 (admin) and a2 (member) in team A; b1 in team B.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'a1@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'a2@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b1', 'b1@example.test', 'authenticated', 'authenticated');

insert into public.teams (id, name) values
  ('00000000-0000-4000-8000-00000000aaaa', 'Team A'),
  ('00000000-0000-4000-8000-00000000bbbb', 'Team B');

insert into public.team_members (team_id, user_id, role, display_name) values
  ('00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000000a1', 'admin', 'A1'),
  ('00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000000a2', 'member', 'A2'),
  ('00000000-0000-4000-8000-00000000bbbb', '00000000-0000-4000-8000-0000000000b1', 'admin', 'B1');

insert into public.repositories (id, team_id, name) values
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-00000000aaaa', 'acme/app'),
  ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-00000000bbbb', 'other/app');

insert into public.devices (id, user_id, team_id, repository_id, name, agent, capabilities) values
  ('00000000-0000-4000-8000-0000000a0d01', '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000a0001', 'A1 laptop',
   'claude_code', '{"event_capture":"partial","overlap_check":"supported","warning_delivery":"supported"}'),
  ('00000000-0000-4000-8000-0000000b0d01', '00000000-0000-4000-8000-0000000000b1',
   '00000000-0000-4000-8000-00000000bbbb', '00000000-0000-4000-8000-0000000b0001', 'B1 laptop',
   'codex', '{"event_capture":"partial","overlap_check":"unsupported","warning_delivery":"unsupported"}');

insert into private.device_credentials (device_id, token_hash) values
  ('00000000-0000-4000-8000-0000000a0d01', decode(repeat('ab', 32), 'hex'));

insert into public.sessions (
  id, team_id, repository_id, user_id, device_id, agent, started_at, last_activity_at
) values
  ('00000000-0000-4000-8000-0000000a5001', '00000000-0000-4000-8000-00000000aaaa',
   '00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-0000000a0d01', 'claude_code', now(), now()),
  ('00000000-0000-4000-8000-0000000b5001', '00000000-0000-4000-8000-00000000bbbb',
   '00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000000b1',
   '00000000-0000-4000-8000-0000000b0d01', 'codex', now(), now());

insert into public.session_events (
  id, session_id, team_id, sequence, kind, occurred_at, redacted, truncated, payload
) values
  ('00000000-0000-4000-8000-0000000ae001', '00000000-0000-4000-8000-0000000a5001',
   '00000000-0000-4000-8000-00000000aaaa', 0, 'user.message', now(), false, false,
   '{"text":"Add bookmarks","branch":"main"}'),
  ('00000000-0000-4000-8000-0000000ae002', '00000000-0000-4000-8000-0000000a5001',
   '00000000-0000-4000-8000-00000000aaaa', 1, 'assistant.message', now(), false, false,
   '{"text":"Done"}'),
  ('00000000-0000-4000-8000-0000000be001', '00000000-0000-4000-8000-0000000b5001',
   '00000000-0000-4000-8000-00000000bbbb', 0, 'user.message', now(), false, false,
   '{"text":"Team B secret plan","branch":"main"}');

insert into public.overlap_checks (
  team_id, repository_id, session_id, user_id, trigger_event_id, outcome, unavailable_reason
) values
  ('00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000a0001',
   '00000000-0000-4000-8000-0000000a5001', '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-0000000ae001', 'unavailable', 'timeout');

insert into public.cleanup_notices (team_id, user_id, reason, freed_bytes) values
  ('00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000000a1', 'quota', 1000);

insert into private.user_usage (user_id, accounted_bytes) values
  ('00000000-0000-4000-8000-0000000000a1', 41000000);

-- ---------------------------------------------------------------------------
-- Structure

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every public and private table has RLS enabled'
);

-- ---------------------------------------------------------------------------
-- a1: sees team A only

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is((select count(*)::int from public.teams), 1, 'a1 sees one team');
select is((select count(*)::int from public.team_members), 2, 'a1 sees both team A members');
select is((select count(*)::int from public.devices), 1, 'a1 sees only team A devices');
select is((select count(*)::int from public.sessions), 1, 'a1 sees only team A sessions');
select is((select count(*)::int from public.session_events), 2, 'a1 sees only team A events');
select is(
  (select count(*)::int from public.session_events
   where id = '00000000-0000-4000-8000-0000000be001'),
  0,
  'a1 cannot read a team B event by ID'
);
select is((select count(*)::int from public.overlap_checks), 1, 'a1 sees team A checks');
select is((select count(*)::int from public.cleanup_notices), 1, 'a1 sees own cleanup notice');

select is(
  (select public.storage_status() -> 'person' ->> 'state'),
  'cleanup',
  'storage_status reports cleanup at 41 MB'
);
select is(
  (select public.storage_status() -> 'database' ->> 'state'),
  'unknown',
  'storage_status treats a missing database measurement as unknown'
);

select throws_ok(
  $$ insert into public.teams (name) values ('Sneaky') $$,
  '42501', null, 'the browser cannot insert rows'
);
select throws_ok(
  $$ update public.sessions set visibility = 'private' $$,
  '42501', null, 'the browser cannot update rows'
);
select throws_ok(
  $$ delete from public.session_events $$,
  '42501', null, 'the browser cannot delete rows'
);
select throws_ok(
  $$ select * from private.device_credentials $$,
  '42501', null, 'the browser cannot read device credentials'
);
select throws_ok(
  $$ select * from private.invites $$,
  '42501', null, 'the browser cannot read invite tokens'
);

-- ---------------------------------------------------------------------------
-- a2: same team, but not the notice owner

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a2';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

select is((select count(*)::int from public.cleanup_notices), 0, 'a2 cannot see a1 notices');
select is(
  (select public.storage_status() -> 'person' ->> 'accounted_bytes'),
  '0',
  'storage_status shows only the caller''s own usage'
);

-- ---------------------------------------------------------------------------
-- anon: nothing

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';
select throws_ok($$ select * from public.sessions $$, '42501', null, 'anon cannot read sessions');
select throws_ok(
  $$ select public.storage_status() $$, '42501', null, 'anon cannot call storage_status'
);

-- ---------------------------------------------------------------------------
-- Removing a member removes read access immediately

reset role;
delete from public.team_members where user_id = '00000000-0000-4000-8000-0000000000a2';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a2';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select is((select count(*)::int from public.session_events), 0, 'a removed member sees no events');

-- ---------------------------------------------------------------------------
-- Constraints

reset role;
select throws_ok(
  $$ insert into public.session_events (id, session_id, team_id, sequence, kind, occurred_at,
       redacted, truncated, payload)
     values ('00000000-0000-4000-8000-0000000ae001', '00000000-0000-4000-8000-0000000a5001',
       '00000000-0000-4000-8000-00000000aaaa', 9, 'assistant.message', now(), false, false,
       '{"text":"retry"}') $$,
  '23505', null, 'a retried event ID is rejected as a duplicate'
);
select throws_ok(
  $$ insert into public.session_events (id, session_id, team_id, sequence, kind, occurred_at,
       redacted, truncated, payload)
     values (gen_random_uuid(), '00000000-0000-4000-8000-0000000a5001',
       '00000000-0000-4000-8000-00000000bbbb', 0, 'assistant.message', now(), false, false,
       '{"text":"cross-team"}') $$,
  '23503', null, 'an event cannot claim a different team than its session'
);
select throws_ok(
  $$ insert into public.team_members (team_id, user_id, role, display_name)
     values ('00000000-0000-4000-8000-00000000bbbb', '00000000-0000-4000-8000-0000000000a1',
       'member', 'A1') $$,
  '23505', null, 'a user can be in only one team'
);

select * from finish();
rollback;
