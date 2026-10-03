-- Draft body for the CLI-generated workspace-foundation migration.
-- Supabase does not apply this file until it is moved into supabase/migrations.
-- No cloud project, extension, seed user, credential, or live data is created here.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
grant usage on schema public to authenticated, service_role;
revoke all on schema public from anon;

-- Future public objects stay closed until their migration adds explicit grants.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_org_idx on public.memberships (user_id, organization_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  purpose text not null default '' check (octet_length(purpose) <= 2000),
  repository_identifier text not null check (char_length(repository_identifier) between 1 and 2048),
  active_intent_revision bigint not null default 0 check (active_intent_revision >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_org_id_id_key unique (organization_id, id)
);
create index projects_org_created_idx on public.projects (organization_id, created_at desc);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  role text not null default 'member' check (role = 'member'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_not_consumed_and_revoked
    check (not (consumed_at is not null and revoked_at is not null)),
  constraint invitations_org_id_key unique (organization_id, id)
);
create index invitations_org_created_idx on public.invitations (organization_id, created_at desc);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Builder device' check (char_length(label) between 1 and 120),
  agent_version text check (agent_version is null or char_length(agent_version) <= 80),
  adapter_version text check (adapter_version is null or char_length(adapter_version) <= 80),
  repository_identifier text not null check (char_length(repository_identifier) between 1 and 2048),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint devices_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint devices_org_project_id_key unique (organization_id, project_id, id),
  constraint devices_org_project_id_owner_key unique (organization_id, project_id, id, owner_user_id)
);
create index devices_owner_recent_idx
  on public.devices (organization_id, project_id, owner_user_id, created_at desc);

-- Secrets are in a non-API schema; exposed device rows contain metadata only.
create table private.device_credentials (
  device_id uuid primary key,
  organization_id uuid not null,
  project_id uuid not null,
  owner_user_id uuid not null,
  token_hash bytea not null check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  constraint device_credentials_hash_key unique (token_hash),
  constraint device_credentials_scope_fkey
    foreign key (organization_id, project_id, device_id, owner_user_id)
    references public.devices (organization_id, project_id, id, owner_user_id) on delete cascade
);

create table private.invitation_secrets (
  invitation_id uuid primary key,
  organization_id uuid not null,
  token_hash bytea not null check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now(),
  constraint invitation_secrets_hash_key unique (token_hash),
  constraint invitation_secrets_scope_fkey
    foreign key (organization_id, invitation_id)
    references public.invitations (organization_id, id) on delete cascade
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  source_session_id text not null check (char_length(source_session_id) between 1 and 255),
  agent_name text not null check (char_length(agent_name) between 1 and 120),
  branch text not null default '' check (char_length(branch) <= 255),
  sharing_state text not null default 'private' check (sharing_state in ('private', 'shared', 'paused')),
  capture_capabilities jsonb not null default '{}'::jsonb
    check (jsonb_typeof(capture_capabilities) = 'object'
      and octet_length(capture_capabilities::text) <= 8192),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_seen_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sessions_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint sessions_device_owner_scope_fkey
    foreign key (organization_id, project_id, device_id, owner_user_id)
    references public.devices (organization_id, project_id, id, owner_user_id) on delete cascade,
  constraint sessions_time_order check (ended_at is null or ended_at >= started_at),
  constraint sessions_org_project_id_key unique (organization_id, project_id, id),
  constraint sessions_org_project_id_owner_key unique (organization_id, project_id, id, owner_user_id),
  constraint sessions_org_project_id_device_key unique (organization_id, project_id, id, device_id),
  constraint sessions_device_source_id_key unique (organization_id, project_id, device_id, source_session_id)
);
create index sessions_project_recent_idx on public.sessions (organization_id, project_id, started_at desc);
create index sessions_owner_recent_idx
  on public.sessions (organization_id, project_id, owner_user_id, started_at desc);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  session_id uuid not null,
  source_event_id text not null check (char_length(source_event_id) between 1 and 255),
  sequence_no bigint not null check (sequence_no >= 0),
  kind text not null check (char_length(kind) between 1 and 64),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  tool_correlation_id text check (tool_correlation_id is null or char_length(tool_correlation_id) <= 255),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384),
  constraint events_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint events_session_scope_fkey
    foreign key (organization_id, project_id, session_id)
    references public.sessions (organization_id, project_id, id) on delete cascade,
  constraint events_source_event_unique unique (organization_id, project_id, session_id, source_event_id),
  constraint events_session_sequence_unique unique (organization_id, project_id, session_id, sequence_no)
);
create index events_project_received_idx on public.events (organization_id, project_id, received_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  session_id uuid not null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  intent text not null default '' check (octet_length(intent) <= 8192),
  source_request text check (source_request is null or octet_length(source_request) <= 16384),
  branch text not null default '' check (char_length(branch) <= 255),
  state text not null default 'proposed'
    check (state in ('proposed', 'checking', 'active', 'awaiting_review', 'completed', 'paused', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint tasks_session_owner_scope_fkey
    foreign key (organization_id, project_id, session_id, owner_user_id)
    references public.sessions (organization_id, project_id, id, owner_user_id) on delete cascade,
  constraint tasks_org_project_id_key unique (organization_id, project_id, id)
);
create index tasks_project_state_updated_idx
  on public.tasks (organization_id, project_id, state, updated_at desc);
create index tasks_owner_updated_idx
  on public.tasks (organization_id, project_id, owner_user_id, updated_at desc);
create index tasks_session_idx on public.tasks (organization_id, project_id, session_id);

create table public.task_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  revision_no integer not null check (revision_no > 0),
  scope_text text not null check (octet_length(scope_text) <= 16384),
  scope_hash bytea not null check (octet_length(scope_hash) = 32),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint task_revisions_task_scope_fkey
    foreign key (organization_id, project_id, task_id)
    references public.tasks (organization_id, project_id, id) on delete cascade,
  constraint task_revisions_number_unique unique (organization_id, project_id, task_id, revision_no),
  constraint task_revisions_id_unique unique (organization_id, project_id, task_id, id)
);

create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid,
  branch text not null default '' check (char_length(branch) <= 255),
  commit_hash text check (commit_hash is null or
    (char_length(commit_hash) in (40, 64) and commit_hash ~ '^[0-9A-Fa-f]{40}([0-9A-Fa-f]{24})?$')),
  dirty_tree_hash bytea check (dirty_tree_hash is null or octet_length(dirty_tree_hash) = 32),
  coverage jsonb not null default '{}'::jsonb
    check (jsonb_typeof(coverage) = 'object' and octet_length(coverage::text) <= 8192),
  created_at timestamptz not null default now(),
  constraint source_snapshots_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint source_snapshots_session_owner_scope_fkey
    foreign key (organization_id, project_id, session_id, owner_user_id)
    references public.sessions (organization_id, project_id, id, owner_user_id) on delete cascade,
  constraint source_snapshots_org_project_id_key unique (organization_id, project_id, id)
);
create index source_snapshots_project_recent_idx
  on public.source_snapshots (organization_id, project_id, created_at desc);
create index source_snapshots_session_idx on public.source_snapshots (organization_id, project_id, session_id);

create table public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  snapshot_id uuid not null,
  relative_path text not null check (
    char_length(relative_path) between 1 and 1024
    and relative_path <> '.'
    and relative_path !~ '(^/|(^|/)\.\.(/|$)|\\)'
  ),
  line_start integer not null check (line_start > 0),
  line_end integer not null check (line_end >= line_start),
  content_hash bytea not null check (octet_length(content_hash) = 32),
  approved_content text not null check (octet_length(approved_content) <= 16384),
  created_at timestamptz not null default now(),
  constraint source_chunks_snapshot_scope_fkey
    foreign key (organization_id, project_id, snapshot_id)
    references public.source_snapshots (organization_id, project_id, id) on delete cascade,
  constraint source_chunks_path_range_unique
    unique (organization_id, project_id, snapshot_id, relative_path, line_start, line_end)
);
create index source_chunks_snapshot_path_idx
  on public.source_chunks (organization_id, project_id, snapshot_id, relative_path, line_start);

create table public.checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  task_revision_id uuid not null,
  evidence_snapshot_id uuid,
  created_by uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  inspected_active_intent_revision bigint not null check (inspected_active_intent_revision >= 0),
  policy_version text not null check (char_length(policy_version) between 1 and 100),
  model_version text check (model_version is null or char_length(model_version) <= 160),
  status text not null default 'checking' check (status in ('checking', 'complete', 'stale', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint checks_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint checks_task_revision_scope_fkey
    foreign key (organization_id, project_id, task_id, task_revision_id)
    references public.task_revisions (organization_id, project_id, task_id, id) on delete cascade,
  constraint checks_evidence_snapshot_scope_fkey
    foreign key (organization_id, project_id, evidence_snapshot_id)
    references public.source_snapshots (organization_id, project_id, id) on delete cascade,
  constraint checks_request_unique unique (organization_id, project_id, created_by, request_id),
  constraint checks_org_project_id_key unique (organization_id, project_id, id),
  constraint checks_org_project_id_task_key unique (organization_id, project_id, id, task_id)
);
create index checks_task_recent_idx on public.checks (organization_id, project_id, task_id, created_at desc);
create index checks_project_recent_idx on public.checks (organization_id, project_id, created_at desc);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  originating_check_id uuid not null,
  left_task_id uuid not null,
  left_task_revision_id uuid not null,
  right_task_id uuid not null,
  right_task_revision_id uuid not null,
  relation text not null check (relation in ('overlap', 'conflict', 'related')),
  status text not null default 'open' check (status in ('open', 'dismissed', 'resolved', 'stale')),
  evidence_references jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_references) = 'array'
      and octet_length(evidence_references::text) <= 16384),
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint findings_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint findings_check_scope_fkey
    foreign key (organization_id, project_id, originating_check_id)
    references public.checks (organization_id, project_id, id) on delete cascade,
  constraint findings_left_revision_scope_fkey
    foreign key (organization_id, project_id, left_task_id, left_task_revision_id)
    references public.task_revisions (organization_id, project_id, task_id, id) on delete cascade,
  constraint findings_right_revision_scope_fkey
    foreign key (organization_id, project_id, right_task_id, right_task_revision_id)
    references public.task_revisions (organization_id, project_id, task_id, id) on delete cascade,
  constraint findings_ordered_pair_check check (left_task_id < right_task_id),
  constraint findings_pair_revision_relation_unique
    unique (organization_id, project_id, left_task_id, right_task_id,
      left_task_revision_id, right_task_revision_id, relation)
);
create index findings_project_status_recent_idx
  on public.findings (organization_id, project_id, status, first_seen_at desc);

create table public.resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  check_id uuid not null,
  task_id uuid not null,
  task_revision_id uuid not null,
  session_id uuid not null,
  device_id uuid not null,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  action text not null check (action in ('approve', 'override', 'reject', 'pause', 'cancel')),
  accepted_scope text not null default '' check (octet_length(accepted_scope) <= 8192),
  delivery_state text not null default 'pending'
    check (delivery_state in ('pending', 'delivered', 'consumed', 'revoked', 'expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint resolutions_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint resolutions_check_task_scope_fkey
    foreign key (organization_id, project_id, check_id, task_id)
    references public.checks (organization_id, project_id, id, task_id) on delete cascade,
  constraint resolutions_task_revision_scope_fkey
    foreign key (organization_id, project_id, task_id, task_revision_id)
    references public.task_revisions (organization_id, project_id, task_id, id) on delete cascade,
  constraint resolutions_session_device_scope_fkey
    foreign key (organization_id, project_id, session_id, device_id)
    references public.sessions (organization_id, project_id, id, device_id) on delete cascade,
  constraint resolutions_one_check_session_unique unique (organization_id, project_id, check_id, session_id),
  constraint resolutions_request_unique unique (organization_id, project_id, actor_user_id, request_id),
  constraint resolutions_consumed_state_check check (consumed_at is null or delivery_state = 'consumed')
);
create index resolutions_session_expiry_idx
  on public.resolutions (organization_id, project_id, session_id, expires_at);

create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  task_revision_id uuid not null,
  check_id uuid,
  source_session_id uuid not null,
  target_session_id uuid,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  handoff_kind text not null check (handoff_kind in ('proposal', 'context', 'ownership_transfer')),
  context_packet text not null check (octet_length(context_packet) <= 32768),
  delivery_state text not null default 'pending'
    check (delivery_state in ('pending', 'delivered', 'consumed', 'revoked', 'expired')),
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint handoffs_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint handoffs_task_revision_scope_fkey
    foreign key (organization_id, project_id, task_id, task_revision_id)
    references public.task_revisions (organization_id, project_id, task_id, id) on delete cascade,
  constraint handoffs_check_task_scope_fkey
    foreign key (organization_id, project_id, check_id, task_id)
    references public.checks (organization_id, project_id, id, task_id) on delete cascade,
  constraint handoffs_source_session_scope_fkey
    foreign key (organization_id, project_id, source_session_id)
    references public.sessions (organization_id, project_id, id) on delete cascade,
  constraint handoffs_target_session_scope_fkey
    foreign key (organization_id, project_id, target_session_id)
    references public.sessions (organization_id, project_id, id) on delete cascade,
  constraint handoffs_request_unique unique (organization_id, project_id, actor_user_id, request_id),
  constraint handoffs_consumed_state_check check (consumed_at is null or delivery_state = 'consumed')
);
create index handoffs_task_recent_idx on public.handoffs (organization_id, project_id, task_id, created_at desc);
create index handoffs_delivery_expiry_idx
  on public.handoffs (organization_id, project_id, delivery_state, expires_at);

create table public.coordination_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  check_id uuid,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  message_kind text not null check (message_kind in ('proposal', 'acceptance', 'question', 'note')),
  body text not null check (octet_length(body) between 1 and 8192),
  source_references jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_references) = 'array'
      and octet_length(source_references::text) <= 8192),
  created_at timestamptz not null default now(),
  constraint coordination_messages_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint coordination_messages_task_scope_fkey
    foreign key (organization_id, project_id, task_id)
    references public.tasks (organization_id, project_id, id) on delete cascade,
  constraint coordination_messages_check_task_scope_fkey
    foreign key (organization_id, project_id, check_id, task_id)
    references public.checks (organization_id, project_id, id, task_id) on delete cascade
);
create index coordination_messages_task_recent_idx
  on public.coordination_messages (organization_id, project_id, task_id, created_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  request_id uuid,
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null check (char_length(target_type) between 1 and 80),
  target_id uuid,
  outcome text not null check (outcome in ('accepted', 'rejected', 'failed', 'denied')),
  occurred_at timestamptz not null default now(),
  constraint audit_events_project_scope_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade
);
create index audit_events_project_recent_idx
  on public.audit_events (organization_id, project_id, occurred_at desc);

-- Sandbox Stripe receipt/confirmation records only; there are no raw payloads
-- and these rows do not implement production billing entitlements.
create table public.billing_events (
  event_id text primary key check (char_length(event_id) between 1 and 255),
  event_type text not null check (char_length(event_type) between 1 and 120),
  checkout_session_id text not null
    check (checkout_session_id like 'cs_test\_%' escape '\'
      and char_length(checkout_session_id) <= 255),
  received_at timestamptz not null default now()
);

create table public.sandbox_payments (
  checkout_session_id text primary key
    check (checkout_session_id like 'cs_test\_%' escape '\'
      and char_length(checkout_session_id) <= 255),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_event_id text not null unique
    references public.billing_events (event_id) on delete restrict,
  paid_at timestamptz not null default now()
);
create index sandbox_payments_user_recent_idx on public.sandbox_payments (user_id, paid_at desc);

-- A trusted webhook route verifies Stripe signature, paid status, and
-- livemode=false before calling this retry-safe, atomic, invoker function.
create or replace function public.record_sandbox_payment(
  p_event_id text,
  p_event_type text,
  p_checkout_session_id text,
  p_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  existing_event public.billing_events%rowtype;
  existing_payment public.sandbox_payments%rowtype;
begin
  if p_event_type not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
    raise exception 'unsupported Stripe event type' using errcode = '22023';
  end if;
  if p_checkout_session_id is null or p_checkout_session_id not like 'cs_test\_%' escape '\' then
    raise exception 'only Stripe test-mode checkout sessions are accepted' using errcode = '22023';
  end if;

  insert into public.billing_events (event_id, event_type, checkout_session_id)
  values (p_event_id, p_event_type, p_checkout_session_id)
  on conflict (event_id) do nothing;

  select * into existing_event
  from public.billing_events e
  where e.event_id = p_event_id;
  if existing_event.event_type <> p_event_type
    or existing_event.checkout_session_id <> p_checkout_session_id then
    raise exception 'Stripe event ID was reused with different data' using errcode = '23505';
  end if;

  insert into public.sandbox_payments (checkout_session_id, user_id, stripe_event_id)
  values (p_checkout_session_id, p_user_id, p_event_id)
  on conflict (checkout_session_id) do nothing;

  select * into existing_payment
  from public.sandbox_payments p
  where p.checkout_session_id = p_checkout_session_id;
  if existing_payment.user_id <> p_user_id then
    raise exception 'checkout session is already bound to a different user' using errcode = '23505';
  end if;
end;
$function$;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.projects enable row level security;
alter table public.invitations enable row level security;
alter table public.devices enable row level security;
alter table private.device_credentials enable row level security;
alter table private.invitation_secrets enable row level security;
alter table public.sessions enable row level security;
alter table public.events enable row level security;
alter table public.tasks enable row level security;
alter table public.task_revisions enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.source_chunks enable row level security;
alter table public.checks enable row level security;
alter table public.findings enable row level security;
alter table public.resolutions enable row level security;
alter table public.handoffs enable row level security;
alter table public.coordination_messages enable row level security;
alter table public.audit_events enable row level security;
alter table public.billing_events enable row level security;
alter table public.sandbox_payments enable row level security;

-- Helpers query membership through SECURITY DEFINER to avoid recursive RLS.
-- They accept only a scope ID and always derive the actor from auth.uid().
create or replace function private.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = auth.uid()
  );
$function$;

create or replace function private.is_organization_owner(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid() and m.role = 'owner'
  );
$function$;

create or replace function private.can_view_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.projects p
    join public.memberships m on m.organization_id = p.organization_id
    where p.id = p_project_id and m.user_id = auth.uid()
  );
$function$;

create or replace function private.can_view_session(p_organization_id uuid, p_project_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.sessions s
    where s.organization_id = p_organization_id and s.project_id = p_project_id
      and s.id = p_session_id and s.deleted_at is null
      and (s.owner_user_id = auth.uid()
        or (s.sharing_state in ('shared', 'paused') and private.can_view_project(s.project_id)))
  );
$function$;

create or replace function private.can_view_task(p_organization_id uuid, p_project_id uuid, p_task_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.tasks t
    where t.organization_id = p_organization_id and t.project_id = p_project_id
      and t.id = p_task_id
      and (t.owner_user_id = auth.uid()
        or private.can_view_session(t.organization_id, t.project_id, t.session_id))
  );
$function$;

create or replace function private.can_view_snapshot(p_organization_id uuid, p_project_id uuid, p_snapshot_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.source_snapshots s
    where s.organization_id = p_organization_id and s.project_id = p_project_id
      and s.id = p_snapshot_id
      and (s.owner_user_id = auth.uid()
        or (s.session_id is not null
          and private.can_view_session(s.organization_id, s.project_id, s.session_id)))
  );
$function$;

revoke all on function private.is_organization_member(uuid) from public, anon;
revoke all on function private.is_organization_owner(uuid) from public, anon;
revoke all on function private.can_view_project(uuid) from public, anon;
revoke all on function private.can_view_session(uuid, uuid, uuid) from public, anon;
revoke all on function private.can_view_task(uuid, uuid, uuid) from public, anon;
revoke all on function private.can_view_snapshot(uuid, uuid, uuid) from public, anon;
grant execute on function private.is_organization_member(uuid) to authenticated, service_role;
grant execute on function private.is_organization_owner(uuid) to authenticated, service_role;
grant execute on function private.can_view_project(uuid) to authenticated, service_role;
grant execute on function private.can_view_session(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_task(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_snapshot(uuid, uuid, uuid) to authenticated, service_role;

create policy organizations_member_select on public.organizations
  for select to authenticated using ((select private.is_organization_member(id)));
create policy memberships_member_select on public.memberships
  for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy projects_member_select on public.projects
  for select to authenticated using ((select private.can_view_project(id)));
create policy invitations_owner_select on public.invitations
  for select to authenticated using ((select private.is_organization_owner(organization_id)));
create policy devices_owner_or_org_owner_select on public.devices
  for select to authenticated using (
    owner_user_id = (select auth.uid())
    or (select private.is_organization_owner(organization_id))
  );
create policy sessions_owner_or_shared_member_select on public.sessions
  for select to authenticated using (
    deleted_at is null and (
      owner_user_id = (select auth.uid())
      or (sharing_state in ('shared', 'paused') and (select private.can_view_project(project_id)))
    )
  );
create policy events_session_select on public.events
  for select to authenticated using ((select private.can_view_session(organization_id, project_id, session_id)));
create policy tasks_owner_or_shared_session_select on public.tasks
  for select to authenticated using ((select private.can_view_task(organization_id, project_id, id)));
create policy task_revisions_task_select on public.task_revisions
  for select to authenticated using ((select private.can_view_task(organization_id, project_id, task_id)));
create policy source_snapshots_owner_or_shared_session_select on public.source_snapshots
  for select to authenticated using ((select private.can_view_snapshot(organization_id, project_id, id)));
create policy source_chunks_snapshot_select on public.source_chunks
  for select to authenticated using ((select private.can_view_snapshot(organization_id, project_id, snapshot_id)));
create policy checks_task_select on public.checks
  for select to authenticated using ((select private.can_view_task(organization_id, project_id, task_id)));
create policy findings_both_tasks_select on public.findings
  for select to authenticated using (
    (select private.can_view_task(organization_id, project_id, left_task_id))
    and (select private.can_view_task(organization_id, project_id, right_task_id))
  );
create policy coordination_messages_task_select on public.coordination_messages
  for select to authenticated using ((select private.can_view_task(organization_id, project_id, task_id)));
create policy audit_events_project_member_select on public.audit_events
  for select to authenticated using ((select private.can_view_project(project_id)));
create policy sandbox_payments_owner_select on public.sandbox_payments
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated, service_role;
grant select on public.organizations, public.memberships, public.projects, public.invitations,
  public.sessions, public.events, public.tasks, public.task_revisions, public.source_snapshots,
  public.source_chunks, public.checks, public.findings, public.coordination_messages,
  public.audit_events, public.sandbox_payments to authenticated;
grant select (id, organization_id, project_id, owner_user_id, label, agent_version,
  adapter_version, repository_identifier, last_seen_at, revoked_at, created_at)
  on public.devices to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema private to service_role;

revoke all on function public.record_sandbox_payment(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_sandbox_payment(text, text, text, uuid) to service_role;
