-- Demo billing: test-mode Stripe is authoritative; clients only read their team's state.
create table public.team_billing (
  team_id uuid primary key references public.teams(id) on delete cascade,
  customer_id text unique check (customer_id like 'cus_%'),
  subscription_id text unique check (subscription_id like 'sub_%'),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'none' check (status in ('none','active','past_due','unpaid','canceled','incomplete','incomplete_expired','trialing','paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  check (plan <> 'pro' or (status = 'active' and current_period_end is not null))
);
alter table public.team_billing enable row level security;
create policy team_billing_member_select on public.team_billing for select to authenticated using (private.is_team_member(team_id));
revoke all on public.team_billing from public, anon, authenticated;
grant select on public.team_billing to authenticated;
grant select, insert, update, delete on public.team_billing to service_role;

create table private.billing_operations (
  team_id uuid primary key references public.teams(id) on delete cascade,
  lease_token uuid,
  lease_until timestamptz,
  checkout_id text,
  checkout_request_key uuid
);
create table private.billing_webhook_events (
  event_id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table private.billing_operations enable row level security;
alter table private.billing_webhook_events enable row level security;
revoke all on private.billing_operations, private.billing_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on private.billing_operations, private.billing_webhook_events to service_role;

create or replace function private.team_plan_limits(p_team_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.team_billing b where b.team_id = p_team_id and b.plan = 'pro'
      and b.status = 'active' and b.current_period_end > now()
  ) then '{"members":10,"repositories":5}'::jsonb else '{"members":2,"repositories":1}'::jsonb end;
$$;
revoke all on function private.team_plan_limits(uuid) from public, anon, authenticated;
grant execute on function private.team_plan_limits(uuid) to service_role;

-- Only the trusted server may call this function. A short, durable lease fences stale
-- workers while they fetch canonical Stripe state. No network calls run inside a SQL transaction.
create function public.billing_command(p_team_id uuid, p_action text, p_token uuid default null, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_operation private.billing_operations;
  v_billing public.team_billing;
  v_token uuid;
  v_event_id text := p_data->>'event_id';
begin
  if p_action = 'claim' then
    insert into public.team_billing(team_id) values(p_team_id) on conflict do nothing;
    insert into private.billing_operations(team_id) values(p_team_id) on conflict do nothing;
    select * into v_operation from private.billing_operations where team_id = p_team_id for update;
    if v_event_id is not null and exists (select 1 from private.billing_webhook_events where event_id = v_event_id) then
      return jsonb_build_object('duplicate',true);
    end if;
    if v_operation.lease_until > now() then return jsonb_build_object('busy',true); end if;
    v_token := gen_random_uuid();
    update private.billing_operations set lease_token = v_token, lease_until = now() + interval '90 seconds' where team_id = p_team_id;
    select * into v_billing from public.team_billing where team_id = p_team_id;
    return jsonb_build_object('token',v_token,'billing',to_jsonb(v_billing),'checkout_id',v_operation.checkout_id,'checkout_request_key',v_operation.checkout_request_key);
  end if;
  select * into v_operation from private.billing_operations where team_id = p_team_id for update;
  if v_operation.lease_token is distinct from p_token or p_token is null or v_operation.lease_until <= now() then
    raise exception 'Billing operation expired' using errcode = '40001';
  end if;
  if p_action = 'customer' then
    update public.team_billing set customer_id = p_data->>'customer_id', updated_at = now()
      where team_id = p_team_id and (customer_id is null or customer_id = p_data->>'customer_id');
    if not found then raise exception 'Customer mapping already exists'; end if;
  elsif p_action = 'checkout' then
    update private.billing_operations set checkout_id = p_data->>'checkout_id', checkout_request_key = (p_data->>'request_key')::uuid where team_id = p_team_id;
  elsif p_action = 'complete' then
    -- The application supplies a newly retrieved, validated Stripe snapshot, never webhook payload state.
    update public.team_billing set
      subscription_id = p_data->>'subscription_id',
      plan = p_data->>'plan', status = p_data->>'status',
      current_period_end = (p_data->>'current_period_end')::timestamptz,
      cancel_at_period_end = coalesce((p_data->>'cancel_at_period_end')::boolean,false),
      updated_at = now()
    where team_id = p_team_id;
    if v_event_id is not null then
      insert into private.billing_webhook_events(event_id,team_id,event_type)
      values(v_event_id,p_team_id,p_data->>'event_type') on conflict do nothing;
    end if;
    update private.billing_operations set lease_token = null, lease_until = null where team_id = p_team_id;
  elsif p_action = 'release' then
    update private.billing_operations set lease_token = null, lease_until = null where team_id = p_team_id;
  else raise exception 'Unknown billing command';
  end if;
  return '{"ok":true}'::jsonb;
end;
$$;
revoke all on function public.billing_command(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.billing_command(uuid,text,uuid,jsonb) to service_role;
