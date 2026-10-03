-- ShareSpace v1 schema. Row shapes match packages/core/src/v1.ts (see docs/CONTRACT.md).
--
-- Access model:
-- - The browser (authenticated) can only SELECT, and RLS limits rows to the user's current team.
-- - All writes go through Edge Functions that use service_role.
-- - Secrets, credentials and usage counters live in the private schema, which the Data API does
--   not expose.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Teams

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  display_name text not null check (char_length(display_name) between 1 and 100),
  avatar_url text check (char_length(avatar_url) <= 2000),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  -- One team per user in v1.
  unique (user_id)
);

create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (
    char_length(name) <= 200 and name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
  ),
  created_at timestamptz not null default now(),
  unique (id, team_id)
);
create unique index repositories_team_name_key on public.repositories (team_id, lower(name));

-- ---------------------------------------------------------------------------
-- Devices (metadata only; the token hash is in private.device_credentials)

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid not null,
  repository_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  agent text not null check (agent in ('claude_code', 'codex')),
  agent_version text check (char_length(agent_version) between 1 and 50),
  capabilities jsonb not null check (
    jsonb_typeof(capabilities) = 'object'
    and capabilities ?& array['event_capture', 'overlap_check', 'warning_delivery']
  ),
  status text not null default 'approved' check (status in ('approved', 'revoked')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  check ((status = 'revoked') = (revoked_at is not null)),
  foreign key (repository_id, team_id) references public.repositories (id, team_id) on delete cascade,
  unique (id, team_id)
);
create index devices_team_idx on public.devices (team_id);
create index devices_user_idx on public.devices (user_id);

-- ---------------------------------------------------------------------------
-- Sharing. No row means sharing is off.

create table public.sharing_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  repository_id uuid not null,
  team_id uuid not null,
  enabled boolean not null default false,
  paused boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, repository_id),
  foreign key (repository_id, team_id) references public.repositories (id, team_id) on delete cascade
);
create index sharing_settings_team_idx on public.sharing_settings (team_id);

-- ---------------------------------------------------------------------------
-- Sessions and events

create table public.sessions (
  -- Chosen by the adapter, so retries land on the same session.
  id uuid primary key,
  team_id uuid not null,
  repository_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  agent text not null check (agent in ('claude_code', 'codex')),
  agent_version text check (char_length(agent_version) between 1 and 50),
  branch text check (char_length(branch) <= 255),
  title text check (char_length(title) <= 120),
  latest_prompt text check (char_length(latest_prompt) <= 500),
  touched_paths text[] not null default '{}' check (cardinality(touched_paths) <= 50),
  visibility text not null default 'shared' check (visibility in ('shared', 'private')),
  capture_limitations text[] not null default '{}' check (cardinality(capture_limitations) <= 20),
  started_at timestamptz not null,
  last_activity_at timestamptz not null,
  ended_at timestamptz,
  event_count integer not null default 0 check (event_count >= 0),
  history_removed_at timestamptz,
  history_removed_reason text check (history_removed_reason in ('owner_deleted', 'pruned')),
  check ((history_removed_at is null) = (history_removed_reason is null)),
  foreign key (repository_id, team_id) references public.repositories (id, team_id) on delete cascade,
  foreign key (device_id, team_id) references public.devices (id, team_id),
  unique (id, team_id)
);
create index sessions_team_activity_idx on public.sessions (team_id, last_activity_at desc);
create index sessions_user_started_idx on public.sessions (user_id, started_at);
create index sessions_device_idx on public.sessions (device_id);

create table public.session_events (
  -- The adapter's stable event_id. A retry hits this key and is reported as a duplicate.
  id uuid primary key,
  session_id uuid not null,
  team_id uuid not null,
  -- Allocation order, not commit order; not sufficient as the sole reconnect cursor.
  ingest_id bigint generated always as identity unique,
  sequence integer not null check (sequence >= 0),
  kind text not null check (
    kind in (
      'session.started', 'session.ended', 'user.message', 'assistant.message',
      'tool.started', 'tool.completed'
    )
  ),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  redacted boolean not null,
  truncated boolean not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384
  ),
  foreign key (session_id, team_id) references public.sessions (id, team_id) on delete cascade
);
create index session_events_display_idx on public.session_events (session_id, sequence, occurred_at, id);
create index session_events_catchup_idx on public.session_events (session_id, ingest_id);
create index session_events_team_idx on public.session_events (team_id);

-- ---------------------------------------------------------------------------
-- Overlap checks

create table public.overlap_checks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  repository_id uuid not null,
  session_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- One check per prompt, so a retried request returns the stored check.
  trigger_event_id uuid not null unique,
  outcome text not null check (outcome in ('warning', 'no_overlap', 'unavailable')),
  request_excerpt text check (char_length(request_excerpt) <= 500),
  findings jsonb not null default '[]' check (
    jsonb_typeof(findings) = 'array' and jsonb_array_length(findings) <= 5
  ),
  unavailable_reason text check (
    unavailable_reason in (
      'timeout', 'provider_error', 'invalid_response', 'provider_unconfigured',
      'context_unavailable'
    )
  ),
  created_at timestamptz not null default now(),
  check ((outcome = 'unavailable') = (unavailable_reason is not null)),
  check (outcome <> 'unavailable' or jsonb_array_length(findings) = 0),
  foreign key (session_id, team_id) references public.sessions (id, team_id) on delete cascade,
  foreign key (repository_id, team_id) references public.repositories (id, team_id) on delete cascade
);
create index overlap_checks_team_created_idx on public.overlap_checks (team_id, created_at desc);
create index overlap_checks_session_idx on public.overlap_checks (session_id);

-- ---------------------------------------------------------------------------
-- Cleanup notices (visible only to the user whose history was removed)

create table public.cleanup_notices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('quota', 'database_capacity', 'owner_deleted')),
  removed_session_ids uuid[] not null default '{}' check (cardinality(removed_session_ids) <= 100),
  freed_bytes bigint not null check (freed_bytes >= 0),
  created_at timestamptz not null default now()
);
create index cleanup_notices_user_idx on public.cleanup_notices (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Private tables (service_role only)

-- Admins can copy the current link, so the token is kept, but only functions can read it.
create table private.invites (
  team_id uuid primary key references public.teams (id) on delete cascade,
  token text not null unique check (token ~ '^ssi-[0-9a-f]{64}$'),
  revision integer not null check (revision > 0),
  created_at timestamptz not null default now()
);

create table private.device_credentials (
  device_id uuid primary key references public.devices (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now()
);

create table private.pairing_requests (
  id uuid primary key default gen_random_uuid(),
  user_code text not null check (user_code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  poll_secret_hash bytea not null check (octet_length(poll_secret_hash) = 32),
  agent text not null check (agent in ('claude_code', 'codex')),
  agent_version text check (char_length(agent_version) between 1 and 50),
  device_name text not null check (char_length(btrim(device_name)) between 1 and 100),
  repository_name text not null check (char_length(repository_name) <= 200),
  capabilities jsonb not null check (jsonb_typeof(capabilities) = 'object'),
  -- "expired" is derived from expires_at, not stored.
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id) on delete set null,
  device_id uuid references public.devices (id) on delete set null,
  -- The token is made at the first poll after approval and only its hash is stored.
  token_delivered_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index pairing_requests_pending_code_key
  on private.pairing_requests (user_code) where status = 'pending';

create table private.user_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  accounted_bytes bigint not null default 0 check (accounted_bytes >= 0),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  updated_at timestamptz not null default now()
);

create table private.session_usage (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  bytes bigint not null default 0 check (bytes >= 0)
);
create index session_usage_user_idx on private.session_usage (user_id);

-- One row, written by the cleanup job from a fresh server-side measurement.
create table private.database_capacity (
  id boolean primary key default true check (id),
  database_bytes bigint check (database_bytes >= 0),
  measured_at timestamptz
);
insert into private.database_capacity (id) values (true);

-- ---------------------------------------------------------------------------
-- Membership helper. SECURITY DEFINER so team_members RLS does not recurse. It lives in the
-- unexposed private schema and checks only the caller's own auth.uid().

create function private.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and m.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security: read-only, current team members only.

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.repositories enable row level security;
alter table public.devices enable row level security;
alter table public.sharing_settings enable row level security;
alter table public.sessions enable row level security;
alter table public.session_events enable row level security;
alter table public.overlap_checks enable row level security;
alter table public.cleanup_notices enable row level security;
alter table private.invites enable row level security;
alter table private.device_credentials enable row level security;
alter table private.pairing_requests enable row level security;
alter table private.user_usage enable row level security;
alter table private.session_usage enable row level security;
alter table private.database_capacity enable row level security;

create policy teams_member_select on public.teams
  for select to authenticated using (private.is_team_member(id));
create policy team_members_member_select on public.team_members
  for select to authenticated using (private.is_team_member(team_id));
create policy repositories_member_select on public.repositories
  for select to authenticated using (private.is_team_member(team_id));
create policy devices_member_select on public.devices
  for select to authenticated using (private.is_team_member(team_id));
create policy sharing_settings_member_select on public.sharing_settings
  for select to authenticated using (private.is_team_member(team_id));
create policy sessions_member_select on public.sessions
  for select to authenticated using (private.is_team_member(team_id));
create policy session_events_member_select on public.session_events
  for select to authenticated using (private.is_team_member(team_id));
create policy overlap_checks_member_select on public.overlap_checks
  for select to authenticated using (private.is_team_member(team_id));
create policy cleanup_notices_owner_select on public.cleanup_notices
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_team_member(team_id));

-- ---------------------------------------------------------------------------
-- storage_status(): the caller's accounted bytes and the shared database size, kept separate.
-- An old or missing database measurement is "unknown", never free space.

create function public.storage_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'person', jsonb_build_object(
      'accounted_bytes', p.bytes,
      'limit_bytes', 50000000,
      'state', case
        when p.bytes >= 50000000 then 'paused'
        when p.bytes >= 40000000 then 'cleanup'
        else 'ok'
      end
    ),
    'database', jsonb_build_object(
      'database_bytes', d.database_bytes,
      'measured_at', d.measured_at,
      'state', case
        when d.database_bytes is null or d.measured_at is null
          or d.measured_at < now() - interval '1 hour' then 'unknown'
        when d.database_bytes >= 400000000 then 'paused'
        when d.database_bytes >= 350000000 then 'warning'
        else 'ok'
      end
    )
  )
  from (
    select coalesce(
      (select u.accounted_bytes from private.user_usage u where u.user_id = (select auth.uid())),
      0
    ) as bytes
  ) p
  cross join private.database_capacity d;
$$;

-- ---------------------------------------------------------------------------
-- Grants. New tables are not exposed to the Data API by default, so grant explicitly.

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.storage_status() from public, anon;

grant usage on schema private to authenticated, service_role;
grant execute on function private.is_team_member(uuid) to authenticated, service_role;
grant execute on function public.storage_status() to authenticated, service_role;

grant select on
  public.teams, public.team_members, public.repositories, public.devices,
  public.sharing_settings, public.sessions, public.session_events, public.overlap_checks,
  public.cleanup_notices
to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema private to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes applies the SELECT policies above per subscriber)

alter publication supabase_realtime add table
  public.sessions, public.session_events, public.overlap_checks, public.cleanup_notices;
