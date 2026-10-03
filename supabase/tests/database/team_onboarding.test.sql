-- Team onboarding functions. Synthetic users only; everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- a1 creates a team, a2 joins it, b1 has a team of their own, c1 has none.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'a1@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'a2@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b1', 'b1@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c1', 'c1@example.test', 'authenticated', 'authenticated');

create temporary table t (key text primary key, value text) on commit drop;

-- Create

insert into t
select 'team_a', private.create_team(
  '00000000-0000-4000-8000-0000000000a1', 'A1', null, '  Team A  ', 'Acme/App'
) #>> '{team,id}';

select is(
  (select name from public.teams where id = (select value::uuid from t where key = 'team_a')),
  'Team A', 'team name is trimmed'
);
select is(
  (select name from public.repositories
   where team_id = (select value::uuid from t where key = 'team_a')),
  'acme/app', 'repository name is stored in lowercase'
);
select is(
  (select role from public.team_members where user_id = '00000000-0000-4000-8000-0000000000a1'),
  'admin', 'the creator becomes admin'
);
select throws_ok(
  $$ select private.create_team(
    '00000000-0000-4000-8000-0000000000a1', 'A1', null, 'Second team', 'acme/second') $$,
  'P0001', 'already_in_team', 'a user cannot create a second team'
);
select throws_ok(
  $$ select private.create_team(
    '00000000-0000-4000-8000-0000000000b1', 'B1', null, 'x', 'acme/app') $$,
  '23514', null, 'a one-character team name is rejected'
);
select throws_ok(
  $$ select private.create_team(
    '00000000-0000-4000-8000-0000000000b1', 'B1', null, 'Team B', 'not-a-repo') $$,
  '23514', null, 'a repository name without owner/name is rejected'
);
select lives_ok(
  $$ select private.create_team(
    '00000000-0000-4000-8000-0000000000b1', 'B1', null, 'Team B', 'other/app') $$,
  'another user can create their own team'
);

-- Invite link

select is(
  private.get_invite(
    '00000000-0000-4000-8000-0000000000a1', (select value::uuid from t where key = 'team_a')),
  '{"invite_token": null, "invite_revision": 0}'::jsonb,
  'a new team has no invite link yet'
);

insert into t
select 'invite_1', private.rotate_invite(
  '00000000-0000-4000-8000-0000000000a1', (select value::uuid from t where key = 'team_a')
) ->> 'invite_token';

select matches(
  (select value from t where key = 'invite_1'), '^ssi-[0-9a-f]{64}$',
  'the invite token matches the contract format'
);
select is(
  private.preview_invite((select value from t where key = 'invite_1')),
  '{"state": "valid", "team_name": "Team A"}'::jsonb,
  'a current link previews as valid with the team name'
);
select is(
  private.preview_invite('ssi-' || repeat('0', 64)) ->> 'state', 'invalid',
  'an unknown link previews as invalid'
);
select throws_ok(
  format($$ select private.get_invite('00000000-0000-4000-8000-0000000000b1', %L) $$,
    (select value from t where key = 'team_a')),
  'P0001', 'not_member', 'a user outside the team cannot read its link'
);

-- Join

select is(
  private.accept_invite(
    '00000000-0000-4000-8000-0000000000a2', 'A2', null, (select value from t where key = 'invite_1')
  ) ->> 'role',
  'member', 'joining through the link adds a member'
);
select is(
  private.accept_invite(
    '00000000-0000-4000-8000-0000000000a2', 'A2', null, (select value from t where key = 'invite_1')
  ) ->> 'role',
  'member', 'joining again returns the same membership'
);
select throws_ok(
  format($$ select private.accept_invite(
    '00000000-0000-4000-8000-0000000000b1', 'B1', null, %L) $$,
    (select value from t where key = 'invite_1')),
  'P0001', 'already_in_team', 'a member of another team cannot join'
);
select throws_ok(
  format($$ select private.rotate_invite('00000000-0000-4000-8000-0000000000a2', %L) $$,
    (select value from t where key = 'team_a')),
  'P0001', 'forbidden', 'a member cannot rotate the link'
);

-- Rotate

insert into t
select 'invite_2', private.rotate_invite(
  '00000000-0000-4000-8000-0000000000a1', (select value::uuid from t where key = 'team_a')
) ->> 'invite_token';

select is(
  private.preview_invite((select value from t where key = 'invite_1')),
  '{"state": "rotated", "team_name": null}'::jsonb,
  'the old link previews as rotated without the team name'
);
select throws_ok(
  format($$ select private.accept_invite(
    '00000000-0000-4000-8000-0000000000c1', 'C1', null, %L) $$,
    (select value from t where key = 'invite_1')),
  'P0001', 'invite_rotated', 'the old link can no longer be used to join'
);
select is(
  (select count(*)::int from public.team_members
   where team_id = (select value::uuid from t where key = 'team_a')),
  2, 'rotating keeps existing members'
);
select is(
  private.get_invite(
    '00000000-0000-4000-8000-0000000000a1', (select value::uuid from t where key = 'team_a')
  ) ->> 'invite_revision',
  '2', 'the revision counts rotations'
);

-- Remove

select throws_ok(
  format($$ select private.remove_member(
    '00000000-0000-4000-8000-0000000000a1', %L, '00000000-0000-4000-8000-0000000000a1') $$,
    (select value from t where key = 'team_a')),
  'P0001', 'last_admin', 'the last admin cannot be removed'
);

insert into public.devices (id, user_id, team_id, repository_id, name, agent, capabilities)
select '00000000-0000-4000-8000-0000000a2d01', '00000000-0000-4000-8000-0000000000a2',
  r.team_id, r.id, 'A2 laptop', 'codex',
  '{"event_capture":"partial","overlap_check":"unsupported","warning_delivery":"unsupported"}'
from public.repositories r where r.team_id = (select value::uuid from t where key = 'team_a');

select lives_ok(
  format($$ select private.remove_member(
    '00000000-0000-4000-8000-0000000000a1', %L, '00000000-0000-4000-8000-0000000000a2') $$,
    (select value from t where key = 'team_a')),
  'an admin can remove a member'
);
select is(
  (select status from public.devices where id = '00000000-0000-4000-8000-0000000a2d01'),
  'revoked', 'removing a member revokes their devices'
);

-- API roles cannot call these functions directly.

set local role authenticated;
select throws_ok(
  $$ select private.preview_invite('ssi-' || repeat('0', 64)) $$,
  '42501', null, 'the authenticated role cannot execute onboarding functions'
);
reset role;

select * from finish();
rollback;
