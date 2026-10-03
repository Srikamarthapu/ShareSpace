-- Team onboarding: create a team, manage its reusable invite link, join, and remove members.
-- Matches the `teams` actions in packages/core/src/v1.ts.
--
-- Only the `teams` Edge Function calls these functions, over its direct database connection,
-- after it has verified the caller's session. They take that caller's user ID as an argument,
-- so no API role may execute them. Errors use the contract's error codes as the message.

-- Hashes of replaced invite tokens, so an old link reports "rotated" instead of "invalid".
create table private.retired_invites (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  team_id uuid not null references public.teams (id) on delete cascade,
  retired_at timestamptz not null default now()
);
alter table private.retired_invites enable row level security;
grant select, insert, update, delete on private.retired_invites to service_role;

create function private.require_team_admin(p_user_id uuid, p_team_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text;
begin
  select m.role into v_role
  from public.team_members m
  where m.team_id = p_team_id and m.user_id = p_user_id;
  if v_role is null then
    raise exception 'not_member';
  elsif v_role <> 'admin' then
    raise exception 'forbidden';
  end if;
end;
$$;

create function private.create_team(
  p_user_id uuid,
  p_display_name text,
  p_avatar_url text,
  p_team_name text,
  p_repository_name text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_team public.teams;
  v_repository public.repositories;
begin
  if exists (select 1 from public.team_members m where m.user_id = p_user_id) then
    raise exception 'already_in_team';
  end if;

  insert into public.teams (name) values (btrim(p_team_name)) returning * into v_team;
  insert into public.repositories (team_id, name)
    values (v_team.id, lower(p_repository_name))
    returning * into v_repository;
  insert into public.team_members (team_id, user_id, role, display_name, avatar_url)
    values (v_team.id, p_user_id, 'admin', p_display_name, p_avatar_url);

  return jsonb_build_object('team', to_jsonb(v_team), 'repository', to_jsonb(v_repository));
exception
  -- A concurrent create or join claimed this user's one team first.
  when unique_violation then
    raise exception 'already_in_team';
end;
$$;

create function private.get_invite(p_user_id uuid, p_team_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_invite private.invites;
begin
  perform private.require_team_admin(p_user_id, p_team_id);
  select * into v_invite from private.invites i where i.team_id = p_team_id;
  return jsonb_build_object(
    'invite_token', v_invite.token,
    'invite_revision', coalesce(v_invite.revision, 0)
  );
end;
$$;

create function private.rotate_invite(p_user_id uuid, p_team_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_old private.invites;
  v_token text := 'ssi-' || encode(extensions.gen_random_bytes(32), 'hex');
  v_revision integer;
begin
  perform private.require_team_admin(p_user_id, p_team_id);
  select * into v_old from private.invites i where i.team_id = p_team_id for update;

  if v_old.token is not null then
    insert into private.retired_invites (token_hash, team_id)
      values (extensions.digest(v_old.token, 'sha256'), p_team_id)
      on conflict (token_hash) do nothing;
  end if;

  insert into private.invites (team_id, token, revision)
    values (p_team_id, v_token, 1)
    on conflict (team_id) do update
      set token = excluded.token,
          revision = private.invites.revision + 1,
          created_at = now()
    returning revision into v_revision;

  return jsonb_build_object('invite_token', v_token, 'invite_revision', v_revision);
end;
$$;

-- Anyone holding a link may preview it. The team name is shown only for a working link.
create function private.preview_invite(p_token text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_team_name text;
begin
  select t.name into v_team_name
  from private.invites i
  join public.teams t on t.id = i.team_id
  where i.token = p_token;

  if v_team_name is not null then
    return jsonb_build_object('state', 'valid', 'team_name', v_team_name);
  elsif exists (
    select 1 from private.retired_invites r
    where r.token_hash = extensions.digest(p_token, 'sha256')
  ) then
    return jsonb_build_object('state', 'rotated', 'team_name', null);
  end if;
  return jsonb_build_object('state', 'invalid', 'team_name', null);
end;
$$;

create function private.accept_invite(
  p_user_id uuid,
  p_display_name text,
  p_avatar_url text,
  p_token text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_current public.team_members;
begin
  select i.team_id into v_team_id from private.invites i where i.token = p_token;
  if v_team_id is null then
    if exists (
      select 1 from private.retired_invites r
      where r.token_hash = extensions.digest(p_token, 'sha256')
    ) then
      raise exception 'invite_rotated';
    end if;
    raise exception 'not_found';
  end if;

  select * into v_current from public.team_members m where m.user_id = p_user_id;
  if v_current.team_id = v_team_id then
    -- Repeating the join returns the existing membership.
    return jsonb_build_object('team_id', v_current.team_id, 'role', v_current.role);
  elsif v_current.team_id is not null then
    raise exception 'already_in_team';
  end if;

  insert into public.team_members (team_id, user_id, role, display_name, avatar_url)
    values (v_team_id, p_user_id, 'member', p_display_name, p_avatar_url);
  return jsonb_build_object('team_id', v_team_id, 'role', 'member');
exception
  when unique_violation then
    select * into v_current from public.team_members m where m.user_id = p_user_id;
    if v_current.team_id = v_team_id then
      return jsonb_build_object('team_id', v_current.team_id, 'role', v_current.role);
    end if;
    raise exception 'already_in_team';
end;
$$;

create function private.remove_member(p_user_id uuid, p_team_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_role text;
begin
  perform private.require_team_admin(p_user_id, p_team_id);
  -- Serialize membership changes in this team so two removals cannot drop the last admin.
  perform 1 from public.teams t where t.id = p_team_id for update;

  select m.role into v_role
  from public.team_members m
  where m.team_id = p_team_id and m.user_id = p_member_id;
  if v_role is null then
    raise exception 'not_found';
  end if;
  if v_role = 'admin' and (
    select count(*) from public.team_members m
    where m.team_id = p_team_id and m.role = 'admin'
  ) = 1 then
    raise exception 'last_admin';
  end if;

  update public.devices d
    set status = 'revoked', revoked_at = now()
    where d.team_id = p_team_id and d.user_id = p_member_id and d.status = 'approved';
  delete from public.team_members m where m.team_id = p_team_id and m.user_id = p_member_id;

  return jsonb_build_object('removed_user_id', p_member_id);
end;
$$;

revoke all on function
  private.require_team_admin(uuid, uuid),
  private.create_team(uuid, text, text, text, text),
  private.get_invite(uuid, uuid),
  private.rotate_invite(uuid, uuid),
  private.preview_invite(text),
  private.accept_invite(uuid, text, text, text),
  private.remove_member(uuid, uuid, uuid)
from public, anon, authenticated;
