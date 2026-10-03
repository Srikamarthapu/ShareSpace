begin;
create extension if not exists pgtap with schema extensions;
select plan(21);
insert into auth.users(id,email,aud,role) values
 ('10000000-0000-4000-8000-0000000000a1','billing-a@example.test','authenticated','authenticated'),
 ('10000000-0000-4000-8000-0000000000b1','billing-b@example.test','authenticated','authenticated');
insert into public.teams(id,name) values
 ('10000000-0000-4000-8000-00000000aaaa','Billing A'),
 ('10000000-0000-4000-8000-00000000bbbb','Billing B');
insert into public.team_members(team_id,user_id,role,display_name) values
 ('10000000-0000-4000-8000-00000000aaaa','10000000-0000-4000-8000-0000000000a1','admin','Billing A'),
 ('10000000-0000-4000-8000-00000000bbbb','10000000-0000-4000-8000-0000000000b1','admin','Billing B');
insert into public.team_billing(team_id,customer_id) values
 ('10000000-0000-4000-8000-00000000aaaa','cus_billing_a'),
 ('10000000-0000-4000-8000-00000000bbbb','cus_billing_b');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000a1';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from public.team_billing),1,'member sees only own team billing');
select is((select customer_id from public.team_billing),'cus_billing_a','customer mapping does not leak across teams');
select throws_ok($$update public.team_billing set plan='pro'$$,'42501',null,'browser cannot self-upgrade');
select throws_ok($$select public.billing_command('10000000-0000-4000-8000-00000000aaaa','claim')$$,'42501',null,'browser cannot claim trusted billing operations');
select throws_ok($$select * from private.billing_webhook_events$$,'42501',null,'browser cannot read webhook ledger');
select throws_ok($$select * from private.billing_operations$$,'42501',null,'browser cannot read operation tokens');
reset role;
set local role anon;
select throws_ok($$select * from public.team_billing$$,'42501',null,'anonymous cannot read billing');
reset role;
select is(private.team_plan_limits('10000000-0000-4000-8000-00000000aaaa')->>'members','2','free plan allows two members');
select is(private.team_plan_limits('10000000-0000-4000-8000-00000000aaaa')->>'repositories','1','free plan allows one repository');
create temporary table billing_test_lease as select public.billing_command('10000000-0000-4000-8000-00000000aaaa','claim') as data;
select ok((select data ? 'token' from billing_test_lease),'worker acquires lease');
select is(public.billing_command('10000000-0000-4000-8000-00000000aaaa','claim')->>'busy','true','concurrent worker must retry');
select throws_ok($$select public.billing_command('10000000-0000-4000-8000-00000000aaaa','release','00000000-0000-4000-8000-000000000000')$$,'40001',null,'stale worker cannot mutate or unlock another worker');
select throws_ok($$select public.billing_command('10000000-0000-4000-8000-00000000aaaa','customer',(select (data->>'token')::uuid from billing_test_lease),'{"customer_id":"cus_different"}')$$,'P0001',null,'established customer mapping cannot be replaced');
select lives_ok($$select public.billing_command('10000000-0000-4000-8000-00000000aaaa','complete',(select (data->>'token')::uuid from billing_test_lease),jsonb_build_object('subscription_id','sub_billing_a','plan','pro','status','active','current_period_end',now()+interval '1 month','cancel_at_period_end',false,'event_id','evt_billing_a','event_type','invoice.paid'))$$,'verified snapshot and event ledger commit together');
select is(private.team_plan_limits('10000000-0000-4000-8000-00000000aaaa')->>'members','10','verified Pro allows ten members');
select is(private.team_plan_limits('10000000-0000-4000-8000-00000000aaaa')->>'repositories','5','verified Pro allows five repositories');
select is(public.billing_command('10000000-0000-4000-8000-00000000aaaa','claim',null,'{"event_id":"evt_billing_a"}')->>'duplicate','true','completed webhook replay is acknowledged without processing');
select is((select count(*)::int from private.billing_webhook_events),1,'webhook is stored exactly once');
update public.team_billing set current_period_end=now()-interval '1 second' where team_id='10000000-0000-4000-8000-00000000aaaa';
select is(private.team_plan_limits('10000000-0000-4000-8000-00000000aaaa')->>'members','2','expired entitlement fails closed even when webhook is delayed');
update public.team_billing set current_period_end=now()+interval '1 month',plan='free',status='past_due' where team_id='10000000-0000-4000-8000-00000000aaaa';
select is(private.team_plan_limits('10000000-0000-4000-8000-00000000aaaa')->>'members','2','failed payment returns to free capacity');
select throws_ok($$update public.team_billing set customer_id='cus_billing_a' where team_id='10000000-0000-4000-8000-00000000bbbb'$$,'23505',null,'a Stripe customer cannot belong to two teams');
select * from finish();
rollback;
