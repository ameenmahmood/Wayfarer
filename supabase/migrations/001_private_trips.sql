-- PostgreSQL / Supabase. All client writes pass through versioned, authorized RPCs.
create extension if not exists pgcrypto;
create table public.memberships(trip_id uuid not null,user_id uuid not null references auth.users(id),email text not null,role text not null check(role in ('owner','editor','viewer')),primary key(trip_id,user_id));
create table public.entities(id uuid primary key,trip_id uuid not null,kind text not null check(kind in ('trip','entry','expense','repayment','packing','template')),data jsonb not null,version bigint not null default 1,updated_at timestamptz not null default now(),updated_by uuid not null references auth.users(id),deleted boolean not null default false);
create index on public.entities(trip_id);
create table public.invitations(id uuid primary key default gen_random_uuid(),trip_id uuid not null,email text not null,role text not null check(role in ('editor','viewer')),token_hash text unique not null,expires_at timestamptz not null default now()+interval '7 days',revoked boolean not null default false,accepted_at timestamptz,created_by uuid not null references auth.users(id));
create table public.operation_receipts(op_id uuid primary key,user_id uuid not null,entity_id uuid not null,result jsonb not null);
create table public.service_limits(user_id uuid not null,bucket text not null,window_start timestamptz not null,hits int not null,primary key(user_id,bucket));
alter table public.memberships enable row level security;
alter table public.entities enable row level security;
alter table public.invitations enable row level security;
alter table public.operation_receipts enable row level security;
alter table public.service_limits enable row level security;
create function public.trip_role(t uuid) returns text language sql stable security definer set search_path=public as $$ select role from memberships where trip_id=t and user_id=auth.uid() $$;
create policy member_read on public.memberships for select to authenticated using(public.trip_role(trip_id) is not null);
create policy entity_read on public.entities for select to authenticated using(public.trip_role(trip_id) is not null and (kind not in ('packing','template') or coalesce((data->>'personal')::boolean,false)=false or data->>'assigned'=auth.uid()::text));
create policy invite_read on public.invitations for select to authenticated using(public.trip_role(trip_id)='owner');
-- No INSERT/UPDATE/DELETE policies: raw REST writes cannot bypass RPC checks.
create function public.assert_money(n numeric) returns void language plpgsql as $$ begin if n is null or n<0 or n>9007199254740991 or n<>trunc(n) then raise exception 'Invalid minor-unit amount'; end if; end $$;
create function public.validate_payload(k text,p jsonb,t uuid) returns void language plpgsql security definer set search_path=public as $$
declare n numeric; subtotal numeric; extras numeric; item jsonb; participant text; split_sum numeric; cnt int; field_name text;
begin
 if jsonb_typeof(p)<>'object' or octet_length(p::text)>65536 then raise exception 'Invalid or oversized record'; end if;
 if k in ('entry','expense','packing','template','trip') and (length(trim(p->>'title')) not between 1 and 200 or p->>'title' is null) then raise exception 'Title required'; end if;
 if k='trip' then
  if jsonb_typeof(p->'categoryBudgets') is distinct from 'object' or jsonb_typeof(p->'people') is distinct from 'array' then raise exception 'Invalid trip structure'; end if;
  if coalesce(p->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
  if (p->>'start')::date>(p->>'end')::date or (p->>'end')::date-(p->>'start')::date>365 then raise exception 'Invalid trip dates'; end if;
  perform public.assert_money((p->>'budget')::numeric);
  if not exists(select 1 from pg_timezone_names where name=p->>'zone') then raise exception 'Invalid timezone'; end if;
 end if;
 if k='entry' then
  if (p->>'duration')::int not between 1 and 10080 then raise exception 'Invalid duration'; end if;
  if not exists(select 1 from pg_timezone_names where name=p->>'zone') then raise exception 'Invalid timezone'; end if;
  if p->>'endZone' is not null and not exists(select 1 from pg_timezone_names where name=p->>'endZone') then raise exception 'Invalid arrival timezone'; end if;
  if coalesce(p->>'link','')<>'' and p->>'link' !~ '^https?://' then raise exception 'Invalid link'; end if;
  if p ? 'lat' and ((p->>'lat')::numeric not between -90 and 90 or (p->>'lng')::numeric not between -180 and 180) then raise exception 'Invalid coordinates'; end if;
  perform public.assert_money((p->>'cost')::numeric);
 end if;
 if k='expense' then
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_typeof(p->'shares') is distinct from 'object' or jsonb_typeof(p->'rate') is distinct from 'object' then raise exception 'Invalid expense structure'; end if;
  if coalesce(p->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
  if coalesce(p->>'mode','') not in ('equal','exact','percentage','weighted') or coalesce(p->>'extraMode','') not in ('equal','proportional') then raise exception 'Invalid split method'; end if;
  perform public.assert_money((p->>'total')::numeric);
  if (p->>'total')::numeric=0 then raise exception 'Expense total must be positive'; end if;
  perform public.assert_money((p->>'tax')::numeric); perform public.assert_money((p->>'tip')::numeric); perform public.assert_money((p->>'fees')::numeric);
  extras=(p->>'tax')::numeric+(p->>'tip')::numeric+(p->>'fees')::numeric; subtotal=(p->>'total')::numeric-extras;
  if subtotal<0 or p->>'mode' not in ('equal','exact','percentage','weighted') or p->>'extraMode' not in ('equal','proportional') then raise exception 'Invalid split'; end if;
  if jsonb_typeof(p->'participants')<>'array' or jsonb_array_length(p->'participants')<1 then raise exception 'Participants required'; end if;
  select count(distinct value) into cnt from jsonb_array_elements_text(p->'participants');
  if cnt<>jsonb_array_length(p->'participants') then raise exception 'Duplicate participants'; end if;
  for participant in select jsonb_array_elements_text(p->'participants') union select p->>'payer' loop
   if not exists(select 1 from entities e where e.id=t and e.kind='trip' and exists(select 1 from jsonb_array_elements(e.data->'people') x where x->>'id'=participant)) then raise exception 'Unknown participant'; end if;
  end loop;
  if jsonb_array_length(p->'items')>0 then
   split_sum=0;
   for item in select jsonb_array_elements(p->'items') loop
    perform public.assert_money((item->>'amount')::numeric); split_sum=split_sum+(item->>'amount')::numeric;
    if jsonb_array_length(item->'participants')<1 then raise exception 'Item participant required'; end if;
    select count(distinct value) into cnt from jsonb_array_elements_text(item->'participants');
    if cnt<>jsonb_array_length(item->'participants') then raise exception 'Duplicate item participant'; end if;
    for participant in select jsonb_array_elements_text(item->'participants') loop
     if not (p->'participants' ? participant) then raise exception 'Item participant outside expense'; end if;
    end loop;
   end loop;
   if split_sum<>subtotal then raise exception 'Items plus extras must reconcile'; end if;
  elsif p->>'mode'<>'equal' then
   split_sum=0;
   for participant in select jsonb_array_elements_text(p->'participants') loop
    n=coalesce((p->'shares'->>participant)::numeric,0); perform public.assert_money(n); split_sum=split_sum+n;
   end loop;
   if (p->>'mode'='exact' and split_sum<>subtotal) or (p->>'mode'='percentage' and split_sum<>10000) or (p->>'mode'='weighted' and split_sum<=0) then raise exception 'Split does not reconcile'; end if;
  end if;
  if p->'rate'->>'num' is null or p->'rate'->>'den' is null or (p->'rate'->>'num')::numeric<=0 or (p->'rate'->>'den')::numeric<=0 then raise exception 'Positive snapshot rate required'; end if;
  perform public.assert_money((p->'rate'->>'num')::numeric); perform public.assert_money((p->'rate'->>'den')::numeric);
  if p->>'currency'=(select data->>'currency' from entities where id=t) and (p->'rate'->>'num')::numeric<>(p->'rate'->>'den')::numeric then raise exception 'Base-currency rate must be one'; end if;
 end if;
 if k='repayment' then
  perform public.assert_money((p->>'amount')::numeric);
  if (p->>'amount')::numeric=0 or p->>'from'=p->>'to' then raise exception 'Invalid repayment'; end if;
  for participant in select p->>'from' union select p->>'to' loop
   if not exists(select 1 from entities e where e.id=t and exists(select 1 from jsonb_array_elements(e.data->'people') x where x->>'id'=participant)) then raise exception 'Unknown traveler'; end if;
  end loop;
 end if;
 if k='packing' and ((p->>'quantity')::int<1 or (coalesce((p->>'personal')::boolean,false) and p->>'assigned' is distinct from auth.uid()::text)) then raise exception 'Invalid personal checklist assignment'; end if;
 if k='template' and coalesce((p->>'personal')::boolean,false) and p->>'assigned' is distinct from auth.uid()::text then raise exception 'Invalid personal template assignment'; end if;
end $$;
create function public.apply_change(op_id uuid,entity_id uuid,trip_id uuid,entity_kind text,base_version bigint,payload jsonb,is_deleted boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid=auth.uid(); actor_role text; old entities; fresh entities; receipt operation_receipts; result jsonb;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 -- Serializes all mutations for a trip, including receipts and financial updates.
 perform pg_advisory_xact_lock(hashtextextended(trip_id::text,0));
 actor_role=public.trip_role(trip_id);
 select * into old from entities where id=entity_id for update;
 if old.id is not null and (old.trip_id<>trip_id or old.kind<>entity_kind) then raise exception 'Immutable record identity'; end if;
 if old.id is null and entity_kind='trip' and entity_id=trip_id then
  if actor_role is not null then raise exception 'Trip already exists'; end if;
  insert into memberships values(trip_id,actor,lower(auth.jwt()->>'email'),'owner'); actor_role='owner';
 end if;
 if actor_role is null or actor_role='viewer' then raise exception 'Editor access required'; end if;
 select * into receipt from operation_receipts r where r.op_id=apply_change.op_id;
 if receipt.op_id is not null then
  if receipt.user_id<>actor or receipt.entity_id<>entity_id then raise exception 'Operation identity mismatch'; end if;
  return receipt.result;
 end if;
 if old.kind in ('packing','template') and coalesce((old.data->>'personal')::boolean,false) and old.data->>'assigned'<>actor::text then raise exception 'Personal list access denied'; end if;
 if entity_kind='trip' then
  if actor_role<>'owner' then raise exception 'Owner access required to change trip settings'; end if;
  if old.id is null then payload=jsonb_set(payload,'{people}',jsonb_build_array(jsonb_build_object('id',actor,'name','You','role','owner')));
  elsif payload->'people' is distinct from old.data->'people' then raise exception 'Memberships must be managed through invitations'; end if;
  if old.id is not null and payload->>'currency'<>old.data->>'currency' then raise exception 'Base currency is immutable'; end if;
 end if;
 if is_deleted and entity_kind='trip' then raise exception 'Trip deletion not supported'; end if;
 if old.deleted or (old.id is not null and old.version<>base_version) or (old.id is null and base_version<>0) then return jsonb_build_object('conflict',true,'entity',to_jsonb(old)); end if;
 if not is_deleted then perform public.validate_payload(entity_kind,payload,trip_id); end if;
 insert into entities(id,trip_id,kind,data,version,updated_by,deleted) values(entity_id,trip_id,entity_kind,payload,coalesce(old.version,0)+1,actor,is_deleted) on conflict(id) do update set data=excluded.data,version=excluded.version,updated_by=actor,updated_at=now(),deleted=excluded.deleted returning * into fresh;
 result=jsonb_build_object('conflict',false,'entity',to_jsonb(fresh));
 insert into operation_receipts values(op_id,actor,entity_id,result);
 return result;
end $$;
create function public.create_invitation(target_trip uuid,target_email text,invite_role text) returns jsonb language plpgsql security definer set search_path=public as $$
declare token text=encode(gen_random_bytes(32),'hex');
begin
 if public.trip_role(target_trip)<>'owner' or public.trip_role(target_trip) is null then raise exception 'Owner access required'; end if;
 if invite_role not in ('editor','viewer') or target_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid invitation'; end if;
 if (select count(*) from invitations where trip_id=target_trip and created_by=auth.uid() and expires_at>now() and not revoked)>50 then raise exception 'Too many pending invitations'; end if;
 insert into invitations(trip_id,email,role,token_hash,created_by) values(target_trip,lower(trim(target_email)),invite_role,encode(digest(token,'sha256'),'hex'),auth.uid());
 return jsonb_build_object('token',token);
end $$;
create function public.accept_invitation(invite_token text) returns uuid language plpgsql security definer set search_path=public as $$
declare inv invitations; e entities;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into inv from invitations where token_hash=encode(digest(invite_token,'sha256'),'hex') for update;
 if inv.id is null or inv.revoked or inv.accepted_at is not null or inv.expires_at<now() or lower(auth.jwt()->>'email')<>inv.email then raise exception 'Invitation is invalid, expired, used, or issued to another email'; end if;
 perform pg_advisory_xact_lock(hashtextextended(inv.trip_id::text,0));
 insert into memberships values(inv.trip_id,auth.uid(),inv.email,inv.role) on conflict do nothing;
 update invitations set accepted_at=now() where id=inv.id;
 select * into e from entities where id=inv.trip_id for update;
 if not exists(select 1 from jsonb_array_elements(e.data->'people') p where p->>'id'=auth.uid()::text) then
  update entities set data=jsonb_set(data,'{people}',(data->'people')||jsonb_build_array(jsonb_build_object('id',auth.uid(),'name',split_part(inv.email,'@',1),'role',inv.role))),version=version+1,updated_at=now(),updated_by=auth.uid() where id=inv.trip_id;
 end if;
 return inv.trip_id;
end $$;
create function public.revoke_invitation(invitation_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare t uuid;
begin select trip_id into t from invitations where id=invitation_id; if public.trip_role(t) is distinct from 'owner' then raise exception 'Owner access required'; end if; update invitations set revoked=true where id=invitation_id; end $$;
create function public.manage_member(target_trip uuid,target_user uuid,new_role text) returns void language plpgsql security definer set search_path=public as $$
begin
 if public.trip_role(target_trip) is distinct from 'owner' then raise exception 'Owner access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_trip::text,0));
 if exists(select 1 from memberships where trip_id=target_trip and user_id=target_user and role='owner') then raise exception 'Cannot revoke owner'; end if;
 if new_role is null then delete from memberships where trip_id=target_trip and user_id=target_user;
 elsif new_role in ('editor','viewer') then update memberships set role=new_role where trip_id=target_trip and user_id=target_user;
 else raise exception 'Invalid role'; end if;
 -- Retain the participant ID in financial history after revocation.
end $$;
create function public.consume_limit(bucket_name text,max_hits int default 30) returns boolean language plpgsql security definer set search_path=public as $$
declare n int;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 insert into service_limits values(auth.uid(),bucket_name,date_trunc('minute',now()),1) on conflict(user_id,bucket) do update set window_start=date_trunc('minute',now()),hits=case when service_limits.window_start=date_trunc('minute',now()) then service_limits.hits+1 else 1 end returning hits into n;
 return n<=least(max_hits,30);
end $$;
revoke all on all tables in schema public from anon,authenticated;
grant select on entities,memberships,invitations to authenticated;
revoke execute on all functions in schema public from public,anon;
grant execute on function trip_role(uuid),apply_change(uuid,uuid,uuid,text,bigint,jsonb,boolean),create_invitation(uuid,text,text),accept_invitation(text),revoke_invitation(uuid),manage_member(uuid,uuid,text),consume_limit(text,int) to authenticated;
alter publication supabase_realtime add table public.entities;
