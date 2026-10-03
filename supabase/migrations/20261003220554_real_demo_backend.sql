-- Real demo mutations. Only the Edge service role can call this API; actors are
-- supplied only after auth.getUser verification, devices only by a SHA-256 token.
-- The global advisory lock deliberately serializes short demo writes, including
-- revocation/privacy and storage reservations. This favors correctness over throughput.
create table private.api_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  requests integer not null default 1
);
alter table private.api_rate_limits enable row level security;
revoke all on private.api_rate_limits from public, anon, authenticated;
grant all on private.api_rate_limits to service_role;

create function private.demo_remove_history(p_session uuid, p_reason text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; freed bigint; begin
  select * into s from public.sessions where id=p_session for update;
  if not found or s.history_removed_at is not null then return 0; end if;
  select greatest(bytes-1024,0) into freed from private.session_usage where session_id=p_session;
  freed := coalesce(freed,0);
  delete from public.session_events where session_id=p_session;
  update public.overlap_checks set request_excerpt=null, findings='[]', outcome='unavailable', unavailable_reason='context_unavailable'
    where session_id=p_session or findings @> jsonb_build_array(jsonb_build_object('related_session_id',p_session))
      or exists(select 1 from jsonb_array_elements(findings) f, jsonb_array_elements(f->'evidence') e where e->>'session_id'=p_session::text);
  update public.sessions set title=null,latest_prompt=null,branch=null,touched_paths='{}',capture_limitations='{}',
    event_count=0,history_removed_at=now(),history_removed_reason=p_reason where id=p_session;
  update private.session_usage set bytes=1024 where session_id=p_session;
  update private.user_usage set accounted_bytes=greatest(accounted_bytes-freed,0),updated_at=now() where user_id=s.user_id;
  insert into public.cleanup_notices(team_id,user_id,reason,removed_session_ids,freed_bytes)
    values(s.team_id,s.user_id,case when p_reason='owner_deleted' then 'owner_deleted' else 'quota' end,array[p_session],freed);
  -- Keep notices bounded separately; they contain no source text.
  delete from public.cleanup_notices where user_id=s.user_id and id in
    (select id from public.cleanup_notices where user_id=s.user_id order by created_at desc offset 100);
  return freed;
end $$;
revoke all on function private.demo_remove_history(uuid,text) from public,anon,authenticated;
grant execute on function private.demo_remove_history(uuid,text) to service_role;

create or replace function public.storage_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'person',jsonb_build_object('accounted_bytes',coalesce(u.accounted_bytes,0),'limit_bytes',50000000,
      'state',case when coalesce(u.accounted_bytes,0)>=50000000 then 'paused' when coalesce(u.accounted_bytes,0)>=40000000 then 'cleanup' else 'ok' end),
    'database',jsonb_build_object('database_bytes',pg_database_size(current_database()),'measured_at',now(),
      'state',case when pg_database_size(current_database())>=400000000 then 'paused' when pg_database_size(current_database())>=350000000 then 'warning' else 'ok' end))
  from (select (select accounted_bytes from private.user_usage where user_id=auth.uid()) accounted_bytes) u
  where auth.uid() is not null;
$$;
revoke all on function public.storage_status() from public,anon;
grant execute on function public.storage_status() to authenticated,service_role;

create function public.demo_api(p_action text,p_payload jsonb default '{}',p_actor uuid default null,p_token_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  actor uuid := p_actor; team uuid; repo uuid; role_name text; limit_members integer:=2; limit_repos integer:=1;
  t public.teams; r public.repositories; d public.devices; s public.sessions; p private.pairing_requests;
  sh public.sharing_settings; inv private.invites; evt jsonb; out_results jsonb:='[]'; payload jsonb;
  existing_event public.session_events; code text; plan jsonb; result jsonb;
  bytes_before bigint; event_bytes bigint; batch_bytes bigint; db_bytes bigint; state text:='ok';
  bucket_name text; request_count integer; request_limit integer; item record;
  check_row public.overlap_checks; new_session boolean; candidate_rows jsonb; evaluation jsonb; canonical_prompt text;
begin
  if current_user <> 'service_role' then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(735182090);
  if p_action not in ('start_pairing','poll_pairing','device_status','ingest','overlap_check','overlap_context') then
    if actor is null then raise exception 'unauthenticated'; end if;
  end if;
  if p_action in ('device_status','ingest','overlap_check','overlap_context') then
    select dv.* into d from public.devices dv join private.device_credentials c on c.device_id=dv.id
      where c.token_hash=decode(p_token_hash,'hex') for update of dv;
    if not found then raise exception 'device_unknown'; end if;
    if d.status<>'approved' then raise exception 'device_revoked'; end if;
    actor:=d.user_id; team:=d.team_id; repo:=d.repository_id;
    if not exists(select 1 from public.team_members where team_id=team and user_id=actor) then raise exception 'not_member'; end if;
    select * into sh from public.sharing_settings where user_id=actor and repository_id=repo;
  else
    select team_id,role into team,role_name from public.team_members where user_id=actor;
  end if;
  -- Fixed global bucket for unauthenticated pairing; verified actors/devices have individual buckets.
  bucket_name:=case when actor is null then 'pairing:'||p_action else actor::text||':'||p_action end;
  request_limit:=case when p_action='ingest' then 120 when p_action='poll_pairing' then 1200 else 120 end;
  insert into private.api_rate_limits(bucket,window_started_at,requests) values(bucket_name,now(),1)
    on conflict(bucket) do update set requests=case when api_rate_limits.window_started_at<now()-interval '1 minute' then 1 else api_rate_limits.requests+1 end,
      window_started_at=case when api_rate_limits.window_started_at<now()-interval '1 minute' then now() else api_rate_limits.window_started_at end
    returning requests into request_count;
  if request_count>request_limit then raise exception 'rate_limited'; end if;
  delete from private.api_rate_limits where window_started_at<now()-interval '1 day';

  if p_action='create_team' then
    if team is not null then raise exception 'already_in_team'; end if;
    insert into public.teams(name) values(p_payload->>'team_name') returning * into t;
    insert into public.team_members(team_id,user_id,role,display_name) values(t.id,actor,'admin',left(coalesce(nullif(p_payload->>'display_name',''),'Builder'),100));
    insert into public.repositories(team_id,name) values(t.id,lower(p_payload->>'repository_name')) returning * into r;
    return jsonb_build_object('team',to_jsonb(t),'repository',to_jsonb(r));
  elsif p_action='add_repository' then
    if team is distinct from (p_payload->>'team_id')::uuid or role_name<>'admin' then raise exception 'forbidden'; end if;
    select * into r from public.repositories where team_id=team and lower(name)=lower(p_payload->>'repository_name');
    if found then return jsonb_build_object('repository',to_jsonb(r)); end if;
    if to_regprocedure('private.team_plan_limits(uuid)') is not null then
      execute 'select private.team_plan_limits($1)' into plan using team;
      limit_repos:=coalesce((plan->>'repositories')::integer,1);
    end if;
    if (select count(*) from public.repositories where team_id=team)>=limit_repos then raise exception 'forbidden' using detail='Repository limit reached. The test Pro plan supports five repositories.'; end if;
    insert into public.repositories(team_id,name) values(team,lower(p_payload->>'repository_name')) returning * into r;
    return jsonb_build_object('repository',to_jsonb(r));
  elsif p_action in ('get_invite','rotate_invite','remove_member') then
    if team is distinct from (p_payload->>'team_id')::uuid or role_name<>'admin' then raise exception 'forbidden'; end if;
    if p_action='remove_member' then
      if not exists(select 1 from public.team_members where team_id=team and user_id=(p_payload->>'user_id')::uuid) then raise exception 'not_found'; end if;
      if exists(select 1 from public.team_members where team_id=team and user_id=(p_payload->>'user_id')::uuid and role='admin')
        and (select count(*) from public.team_members where team_id=team and role='admin')<=1 then raise exception 'last_admin'; end if;
      update public.devices set status='revoked',revoked_at=now() where team_id=team and user_id=(p_payload->>'user_id')::uuid and status='approved';
      delete from public.sharing_settings where team_id=team and user_id=(p_payload->>'user_id')::uuid;
      delete from public.team_members where team_id=team and user_id=(p_payload->>'user_id')::uuid;
      return jsonb_build_object('removed_user_id',p_payload->>'user_id');
    end if;
    if p_action='rotate_invite' then
      insert into private.invites(team_id,token,revision) values(team,p_payload->>'new_token',1)
        on conflict(team_id) do update set token=excluded.token,revision=invites.revision+1,created_at=now();
    end if;
    select * into inv from private.invites where team_id=team;
    return jsonb_build_object('invite_token',inv.token,'invite_revision',coalesce(inv.revision,0));
  elsif p_action in ('preview_invite','accept_invite') then
    select * into inv from private.invites where token=p_payload->>'token';
    if p_action='preview_invite' then
      return jsonb_build_object('state',case when inv.team_id is null then 'invalid' else 'valid' end,'team_name',(select name from public.teams where id=inv.team_id));
    end if;
    if inv.team_id is null then raise exception 'invite_rotated'; end if;
    if team=inv.team_id then return jsonb_build_object('team_id',team,'role',role_name); end if;
    if team is not null then raise exception 'already_in_team'; end if;
    if to_regprocedure('private.team_plan_limits(uuid)') is not null then
      execute 'select private.team_plan_limits($1)' into plan using inv.team_id;
      limit_members:=coalesce((plan->>'members')::integer,2);
    end if;
    if (select count(*) from public.team_members where team_id=inv.team_id)>=limit_members then raise exception 'forbidden' using detail='Team member limit reached. Upgrade the test plan or remove a member.'; end if;
    insert into public.team_members(team_id,user_id,role,display_name) values(inv.team_id,actor,'member',left(coalesce(nullif(p_payload->>'display_name',''),'Builder'),100));
    return jsonb_build_object('team_id',inv.team_id,'role','member');
  elsif p_action='start_pairing' then
    delete from private.pairing_requests where expires_at<now();
    insert into private.pairing_requests(user_code,poll_secret_hash,agent,agent_version,device_name,repository_name,capabilities,expires_at)
      values(p_payload->>'user_code',decode(p_payload->>'poll_secret_hash','hex'),p_payload->>'agent',p_payload->>'agent_version',p_payload->>'device_name',lower(p_payload->>'repository_name'),p_payload->'capabilities',now()+interval '10 minutes') returning * into p;
    return jsonb_build_object('pairing_id',p.id,'user_code',p.user_code,'expires_at',p.expires_at);
  elsif p_action='poll_pairing' then
    select * into p from private.pairing_requests where id=(p_payload->>'pairing_id')::uuid and poll_secret_hash=decode(p_payload->>'poll_secret_hash','hex') for update;
    if not found or p.expires_at<now() or p.token_delivered_at is not null then return jsonb_build_object('status','expired'); end if;
    if p.status<>'approved' then return jsonb_build_object('status',p.status); end if;
    select * into d from public.devices where id=p.device_id;
    if d.status<>'approved' or not exists(select 1 from public.team_members where team_id=d.team_id and user_id=d.user_id) then return jsonb_build_object('status','expired'); end if;
    insert into private.device_credentials(device_id,token_hash) values(d.id,decode(p_payload->>'device_token_hash','hex'));
    update private.pairing_requests set token_delivered_at=now() where id=p.id;
    return jsonb_build_object('status','approved','device_id',d.id,'team_id',d.team_id,'repository_id',d.repository_id);
  elsif p_action in ('get_pairing','approve_pairing','reject_pairing') then
    if team is null then raise exception 'not_member'; end if;
    select * into p from private.pairing_requests where user_code=p_payload->>'user_code' order by created_at desc limit 1 for update;
    if not found then raise exception 'not_found'; end if;
    if p.decided_by is not null and p.decided_by<>actor then raise exception 'forbidden'; end if;
    select * into r from public.repositories where team_id=team and lower(name)=lower(p.repository_name);
    if p_action='get_pairing' then return jsonb_build_object('id',p.id,'user_code',p.user_code,'agent',p.agent,'agent_version',p.agent_version,'device_name',p.device_name,'repository_name',p.repository_name,'repository_id',r.id,'capabilities',p.capabilities,'status',case when p.expires_at<now() then 'expired' else p.status end,'expires_at',p.expires_at); end if;
    if p.expires_at<now() or p.status<>'pending' then raise exception 'pairing_expired'; end if;
    if r.id is null then raise exception 'repository_mismatch'; end if;
    if p_action='reject_pairing' then
      update private.pairing_requests set status='rejected',decided_by=actor where id=p.id;
      return jsonb_build_object('status','rejected');
    end if;
    if (select count(*) from public.devices where user_id=actor and status='approved')>=10 then raise exception 'forbidden' using detail='Revoke an old device before pairing another.'; end if;
    insert into public.devices(user_id,team_id,repository_id,name,agent,agent_version,capabilities) values(actor,team,r.id,p.device_name,p.agent,p.agent_version,p.capabilities) returning * into d;
    update private.pairing_requests set status='approved',decided_by=actor,device_id=d.id where id=p.id;
    return jsonb_build_object('device',to_jsonb(d));
  elsif p_action='revoke_device' then
    select * into d from public.devices where id=(p_payload->>'device_id')::uuid and user_id=actor and team_id=team for update;
    if not found then raise exception 'forbidden'; end if;
    update public.devices set status='revoked',revoked_at=coalesce(revoked_at,now()) where id=d.id returning * into d;
    return jsonb_build_object('device',to_jsonb(d));
  elsif p_action='set_sharing' then
    select * into r from public.repositories where id=(p_payload->>'repository_id')::uuid and team_id=team;
    if not found then raise exception 'not_member'; end if;
    insert into public.sharing_settings(user_id,repository_id,team_id,enabled,paused) values(actor,r.id,team,coalesce((p_payload->>'enabled')::boolean,false),coalesce((p_payload->>'paused')::boolean,false))
      on conflict(user_id,repository_id) do update set enabled=coalesce((p_payload->>'enabled')::boolean,sharing_settings.enabled),paused=coalesce((p_payload->>'paused')::boolean,sharing_settings.paused),updated_at=now() returning * into sh;
    return to_jsonb(sh);
  elsif p_action in ('set_session_visibility','delete_session') then
    select * into s from public.sessions where id=(p_payload->>'session_id')::uuid and user_id=actor and team_id=team for update;
    if not found then raise exception 'forbidden'; end if;
    if p_action='delete_session' then perform private.demo_remove_history(s.id,'owner_deleted');
    else update public.sessions set visibility=p_payload->>'visibility' where id=s.id; end if;
    select * into s from public.sessions where id=s.id;
    return jsonb_build_object('session',to_jsonb(s));
  elsif p_action in ('device_status','ingest','overlap_check','overlap_context') then
    db_bytes:=pg_database_size(current_database());
    update private.database_capacity set database_bytes=db_bytes,measured_at=now() where id;
    state:=case when db_bytes>=400000000 then 'paused' when db_bytes>=350000000 then 'warning' else 'ok' end;
    if p_action='device_status' then return jsonb_build_object('device_id',d.id,'repository_id',repo,'sharing',jsonb_build_object('enabled',coalesce(sh.enabled,false),'paused',coalesce(sh.paused,false)),'storage_state',state); end if;
    if not coalesce(sh.enabled,false) then raise exception 'sharing_disabled'; end if;
    if sh.paused then raise exception 'sharing_paused'; end if;
    if state='paused' then raise exception 'storage_paused'; end if;
    insert into private.user_usage(user_id) values(actor) on conflict do nothing;
    select accounted_bytes into bytes_before from private.user_usage where user_id=actor for update;
    batch_bytes:=case when p_action='ingest' then octet_length((p_payload->'events')::text)*3+jsonb_array_length(p_payload->'events')*2048 else 32768 end;
    if bytes_before+batch_bytes>=40000000 then
      for item in select id from public.sessions where user_id=actor and history_removed_at is null order by last_activity_at,id loop
        perform private.demo_remove_history(item.id,'pruned');
        select accounted_bytes into bytes_before from private.user_usage where user_id=actor;
        exit when bytes_before+batch_bytes<=30000000;
      end loop;
      state:='cleanup';
    end if;
    if bytes_before+batch_bytes>=50000000 then raise exception 'storage_paused'; end if;
    if p_action in ('overlap_check','overlap_context') then
      select * into s from public.sessions where id=(p_payload->>'session_id')::uuid and device_id=d.id and user_id=actor and team_id=team;
      if not found or s.history_removed_at is not null or s.visibility='private' then raise exception 'forbidden'; end if;
      select e.payload->>'text' into canonical_prompt from public.session_events e where e.id=(p_payload->>'event_id')::uuid and e.session_id=s.id and e.kind='user.message';
      if not found then raise exception 'not_found'; end if;
      select * into check_row from public.overlap_checks where trigger_event_id=(p_payload->>'event_id')::uuid and session_id=s.id;
      if found then
        result:=jsonb_build_object('outcome',check_row.outcome,'check_id',check_row.id,'agent_context',case when check_row.outcome='warning' then 'Potential overlap found. Inspect the linked teammate sessions before duplicating work. Search the local repository for an existing implementation.' when check_row.outcome='unavailable' then 'Overlap check unavailable — continuing. Search the local repository for an existing implementation before adding new code.' else 'No overlap found in the supplied recent teammate context. Search the local repository for an existing implementation.' end);
        if p_action='overlap_context' then return jsonb_build_object('cached',result); end if;
        return result;
      end if;
      if p_action='overlap_context' then
        select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into candidate_rows from (
          select cs.id session_id,cs.user_id,ce.id event_id,left(ce.payload->>'text',500) text,cs.title,cs.branch,cs.touched_paths
          from public.sessions cs join public.team_members m on m.team_id=cs.team_id and m.user_id=cs.user_id
          cross join lateral (select se.id,se.payload from public.session_events se where se.session_id=cs.id and se.kind='user.message' order by se.sequence desc,se.occurred_at desc,se.id desc limit 1) ce
          where cs.team_id=team and cs.repository_id=repo and cs.user_id<>actor and cs.history_removed_at is null and cs.visibility='shared' and cs.last_activity_at>now()-interval '24 hours'
          order by cs.last_activity_at desc,cs.id limit 8
        ) c;
        return jsonb_build_object('request_text',canonical_prompt,'candidates',candidate_rows);
      end if;
      evaluation:=coalesce(p_payload->'_evaluation','{"outcome":"unavailable","findings":[],"unavailable_reason":"provider_unconfigured"}'::jsonb);
      if evaluation->>'outcome'='not_applicable' then return jsonb_build_object('outcome','not_applicable','check_id',null,'agent_context',null); end if;
      -- Recheck every referenced source after the provider call. Deleted/private/removed
      -- context cannot be turned into a warning or a misleading no-overlap result.
      for item in select value from jsonb_array_elements(coalesce(p_payload->'_source_context','[]'::jsonb)) loop
        if not exists(select 1 from public.sessions cs join public.team_members m on m.team_id=cs.team_id and m.user_id=cs.user_id join public.session_events ce on ce.session_id=cs.id
          where cs.id=(item.value->>'session_id')::uuid and ce.id=(item.value->>'event_id')::uuid and cs.user_id=(item.value->>'user_id')::uuid
          and cs.team_id=team and cs.repository_id=repo and cs.user_id<>actor and cs.history_removed_at is null and cs.visibility='shared') then
          evaluation:='{"outcome":"unavailable","findings":[],"unavailable_reason":"context_unavailable"}'::jsonb; exit;
        end if;
      end loop;
      insert into public.overlap_checks(team_id,repository_id,session_id,user_id,trigger_event_id,outcome,request_excerpt,findings,unavailable_reason)
        values(team,repo,s.id,actor,(p_payload->>'event_id')::uuid,evaluation->>'outcome',left(canonical_prompt,500),evaluation->'findings',evaluation->>'unavailable_reason') returning * into check_row;
      event_bytes:=octet_length(to_jsonb(check_row)::text)*3+1024;
      update private.session_usage set bytes=bytes+event_bytes where session_id=s.id;
      update private.user_usage set accounted_bytes=accounted_bytes+event_bytes,updated_at=now() where user_id=actor;
      return jsonb_build_object('outcome',check_row.outcome,'check_id',check_row.id,'agent_context',case when check_row.outcome='warning' then 'Potential overlap found. Inspect the linked teammate sessions before duplicating work. Search the local repository for an existing implementation.' when check_row.outcome='unavailable' then 'Overlap check unavailable — continuing. Search the local repository for an existing implementation before adding new code.' else 'No overlap found in the supplied recent teammate context. Search the local repository for an existing implementation.' end);
    end if;
    if jsonb_typeof(p_payload->'events')<>'array' or jsonb_array_length(p_payload->'events') not between 1 and 50 or octet_length(p_payload::text)>524288 then raise exception 'invalid_request'; end if;
    for evt in select value from jsonb_array_elements(p_payload->'events') loop
      code:=null;
      select * into s from public.sessions where id=(evt->>'session_id')::uuid for update;
      new_session:=not found;
      if not new_session then
        if s.device_id<>d.id or s.user_id<>actor or s.team_id<>team or s.repository_id<>repo then code:='session_conflict';
        elsif s.history_removed_at is not null then code:='history_removed';
        elsif s.visibility='private' then code:='session_private'; end if;
      end if;
      select * into existing_event from public.session_events where id=(evt->>'event_id')::uuid;
      if found and code is null then
        if existing_event.session_id=(evt->>'session_id')::uuid and existing_event.team_id=team then
          out_results:=out_results||jsonb_build_array(jsonb_build_object('event_id',evt->>'event_id','outcome','duplicate')); continue;
        else code:='session_conflict'; end if;
      end if;
      if code is not null then out_results:=out_results||jsonb_build_array(jsonb_build_object('event_id',evt->>'event_id','outcome','rejected','code',code)); continue; end if;
      if new_session then
        insert into public.sessions(id,team_id,repository_id,user_id,device_id,agent,agent_version,started_at,last_activity_at)
          values((evt->>'session_id')::uuid,team,repo,actor,d.id,d.agent,d.agent_version,(evt->>'occurred_at')::timestamptz,(evt->>'occurred_at')::timestamptz) returning * into s;
        insert into private.session_usage(session_id,user_id,bytes) values(s.id,actor,1024);
        update private.user_usage set accounted_bytes=accounted_bytes+1024 where user_id=actor;
      end if;
      payload:=evt->'payload'; event_bytes:=octet_length(evt::text)*3+1024;
      insert into public.session_events(id,session_id,team_id,sequence,kind,occurred_at,redacted,truncated,payload)
        values((evt->>'event_id')::uuid,s.id,team,(evt->>'sequence')::integer,evt->>'kind',(evt->>'occurred_at')::timestamptz,(evt->>'redacted')::boolean,(evt->>'truncated')::boolean,payload);
      update public.sessions set event_count=event_count+1,last_activity_at=greatest(last_activity_at,(evt->>'occurred_at')::timestamptz),
        branch=case when evt->>'kind' in ('session.started','user.message') then payload->>'branch' else branch end,
        title=case when evt->>'kind'='user.message' and title is null then left(split_part(payload->>'text',E'\n',1),120) else title end,
        latest_prompt=case when evt->>'kind'='user.message' then left(payload->>'text',500) else latest_prompt end,
        capture_limitations=case when evt->>'kind'='session.started' then array(select jsonb_array_elements_text(payload->'capture_limitations')) else capture_limitations end,
        touched_paths=case when evt->>'kind' in ('tool.started','tool.completed') then array(select distinct x from unnest(touched_paths||array(select jsonb_array_elements_text(payload->'relative_paths'))) x limit 50) else touched_paths end,
        ended_at=case when evt->>'kind'='session.ended' then (evt->>'occurred_at')::timestamptz else ended_at end
        where id=s.id;
      update private.session_usage set bytes=bytes+event_bytes where session_id=s.id;
      update private.user_usage set accounted_bytes=accounted_bytes+event_bytes,updated_at=now() where user_id=actor;
      out_results:=out_results||jsonb_build_array(jsonb_build_object('event_id',evt->>'event_id','outcome','accepted'));
    end loop;
    update public.devices set last_used_at=now() where id=d.id;
    return jsonb_build_object('results',out_results,'sharing',jsonb_build_object('enabled',true,'paused',false),'storage_state',state);
  end if;
  raise exception 'invalid_request';
end $$;
revoke all on function public.demo_api(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.demo_api(text,jsonb,uuid,text) to service_role;
