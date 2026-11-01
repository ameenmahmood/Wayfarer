-- Backend audit hardening. Existing records are preserved; stricter checks apply to future writes.
create or replace function public.validate_payload(k text,p jsonb,t uuid) returns void language plpgsql security definer set search_path=public,extensions as $$
declare n numeric; subtotal numeric; extras numeric; item jsonb; participant text; split_sum numeric; cnt int; field_name text;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>65536 then raise exception 'Invalid or oversized record'; end if;
 if k in ('entry','expense','packing','template','trip','idea') and jsonb_typeof(p->'title') is distinct from 'string' then raise exception 'Title must be text'; end if;
 if k in ('entry','expense','packing','template','trip') and (length(trim(p->>'title')) not between 1 and 200 or p->>'title' is null) then raise exception 'Title required'; end if;
 -- Reject JSON type confusion before casts or arithmetic (missing keys are not false).
 for field_name in select unnest(case k
   when 'trip' then array['budget']
   when 'entry' then array['cost','duration']
   when 'expense' then array['total','tax','tip','fees']
   when 'repayment' then array['amount']
   when 'packing' then array['quantity'] else array[]::text[] end) loop
  if jsonb_typeof(p->field_name) is distinct from 'number' then raise exception 'Numeric field required: %',field_name; end if;
 end loop;
 for field_name in select unnest(array['notes','address','link','reservation','type','date','start','end','endDate','category','assigned','destinations','description']) loop
  if p ? field_name and jsonb_typeof(p->field_name) is distinct from 'string' then raise exception 'Text field required: %',field_name; end if;
 end loop;
 for field_name in select unnest(array['personal','packed','fixed']) loop
  if p ? field_name and jsonb_typeof(p->field_name) is distinct from 'boolean' then raise exception 'Boolean field required: %',field_name; end if;
 end loop;
 if k='entry' and ((p->>'duration')::numeric<>trunc((p->>'duration')::numeric)) then raise exception 'Invalid duration'; end if;
 if k='packing' and ((p->>'quantity')::numeric<>trunc((p->>'quantity')::numeric) or (p->>'quantity')::numeric>100000) then raise exception 'Invalid quantity'; end if;
 if k='trip' then
  if jsonb_typeof(p->'categoryBudgets') is distinct from 'object' or jsonb_typeof(p->'people') is distinct from 'array' then raise exception 'Invalid trip structure'; end if;
  if coalesce(p->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
  if (p->>'start')::date>(p->>'end')::date or (p->>'end')::date-(p->>'start')::date>365 then raise exception 'Invalid trip dates'; end if;
  perform public.assert_money((p->>'budget')::numeric);
  if coalesce(p->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p->>'end','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Trip dates required'; end if;
  for field_name,item in select key,value from jsonb_each(p->'categoryBudgets') loop
   if jsonb_typeof(item) is distinct from 'number' then raise exception 'Invalid category budget'; end if;
   perform public.assert_money((item::text)::numeric);
  end loop;
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
  for field_name,item in select key,value from jsonb_each(p->'shares') loop
   if jsonb_typeof(item) is distinct from 'number' then raise exception 'Numeric split shares required'; end if;
   perform public.assert_money((item::text)::numeric);
  end loop;
  perform public.assert_money((p->>'total')::numeric);
  if (p->>'total')::numeric=0 then raise exception 'Expense total must be positive'; end if;
  perform public.assert_money((p->>'tax')::numeric); perform public.assert_money((p->>'tip')::numeric); perform public.assert_money((p->>'fees')::numeric);
  extras=(p->>'tax')::numeric+(p->>'tip')::numeric+(p->>'fees')::numeric; subtotal=(p->>'total')::numeric-extras;
  if subtotal<0 or p->>'mode' not in ('equal','exact','percentage','weighted') or p->>'extraMode' not in ('equal','proportional') then raise exception 'Invalid split'; end if;
  if jsonb_typeof(p->'participants') is distinct from 'array' or jsonb_array_length(p->'participants')<1 then raise exception 'Participants required'; end if;
  select count(distinct value) into cnt from jsonb_array_elements_text(p->'participants');
  if cnt<>jsonb_array_length(p->'participants') then raise exception 'Duplicate participants'; end if;
  for participant in select jsonb_array_elements_text(p->'participants') union select p->>'payer' loop
   if not exists(select 1 from entities e where e.id=t and e.kind='trip' and exists(select 1 from jsonb_array_elements(e.data->'people') x where x->>'id'=participant)) then raise exception 'Unknown participant'; end if;
  end loop;
  if jsonb_array_length(p->'items')>0 then
   split_sum=0;
   for item in select jsonb_array_elements(p->'items') loop
    if jsonb_typeof(item->'amount') is distinct from 'number' then raise exception 'Invalid item amount'; end if;
    perform public.assert_money((item->>'amount')::numeric); split_sum=split_sum+(item->>'amount')::numeric;
    if jsonb_typeof(item->'participants') is distinct from 'array' or jsonb_array_length(item->'participants')<1 then raise exception 'Item participant required'; end if;
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
  if jsonb_typeof(p->'rate'->'num') is distinct from 'number' or jsonb_typeof(p->'rate'->'den') is distinct from 'number' then raise exception 'Numeric snapshot rate required'; end if;
  if p->'rate'->>'num' is null or p->'rate'->>'den' is null or (p->'rate'->>'num')::numeric<=0 or (p->'rate'->>'den')::numeric<=0 then raise exception 'Positive snapshot rate required'; end if;
  perform public.assert_money((p->'rate'->>'num')::numeric); perform public.assert_money((p->'rate'->>'den')::numeric);
  if jsonb_typeof(p->'rate'->'date') is distinct from 'string' or jsonb_typeof(p->'rate'->'source') is distinct from 'string' then raise exception 'Snapshot date and source required'; end if;
  if coalesce(p->'rate'->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or length(trim(coalesce(p->'rate'->>'source',''))) not between 1 and 200 then raise exception 'Snapshot date and source required'; end if;
  perform (p->'rate'->>'date')::date;
  if p->>'currency'=(select data->>'currency' from entities where id=t) and (p->'rate'->>'num')::numeric<>(p->'rate'->>'den')::numeric then raise exception 'Base-currency rate must be one'; end if;
 end if;
 for field_name in select unnest(case when k='entry' then array['date','endDate'] when k in ('expense','repayment') then array['date'] else array[]::text[] end) loop
  if p ? field_name and coalesce(p->>field_name,'')<>'' then
   if p->>field_name !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
   perform (p->>field_name)::date;
  end if;
 end loop;
 if k='entry' then
  for field_name in select unnest(array['start','end']) loop
   if coalesce(p->>field_name,'')<>'' and p->>field_name !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid local time'; end if;
  end loop;
  if (p ? 'lat') is distinct from (p ? 'lng') then raise exception 'Both coordinates required'; end if;
  if p ? 'lat' and (jsonb_typeof(p->'lat') is distinct from 'number' or jsonb_typeof(p->'lng') is distinct from 'number') then raise exception 'Numeric coordinates required'; end if;
 end if;
 if k='template' then
  if jsonb_typeof(p->'items') is distinct from 'array' then raise exception 'Template items required'; end if;
  for item in select jsonb_array_elements(p->'items') loop
   -- Template assignment is re-applied by the client for the chosen scope.
   perform public.validate_payload('packing',jsonb_set(jsonb_set(item,'{personal}','false'::jsonb),'{assigned}','""'::jsonb),t);
  end loop;
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

create or replace function public.apply_change(op_id uuid,entity_id uuid,trip_id uuid,entity_kind text,base_version bigint,payload jsonb,is_deleted boolean default false) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor uuid=auth.uid(); actor_role text; old entities; fresh entities; receipt operation_receipts; result jsonb;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if op_id is null or entity_id is null or trip_id is null or entity_kind is null or is_deleted is null then raise exception 'Mutation identity required'; end if;
 if base_version is null or base_version<0 then raise exception 'Non-negative version required'; end if;
 if entity_kind='trip' and entity_id is distinct from trip_id then raise exception 'Trip identity mismatch'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>65536 then raise exception 'Invalid or oversized record'; end if;
 -- Serializes all mutations for a trip, including receipts and financial updates.
 perform pg_advisory_xact_lock(hashtextextended(trip_id::text,0));
 actor_role=public.trip_role(trip_id);
 select * into old from entities where id=entity_id for update;
 if old.id is not null and (old.trip_id<>trip_id or old.kind<>entity_kind) then raise exception 'Immutable record identity'; end if;
 -- Deletion wins over offline writes and old operation receipts.
 if exists(select 1 from entities t where t.id=apply_change.trip_id and t.kind='trip' and t.deleted) then
  if actor_role is null or actor_role='viewer' then raise exception 'Editor access required'; end if;
  if old.kind in ('packing','template') and coalesce((old.data->>'personal')::boolean,false) and old.data->>'assigned'<>actor::text then raise exception 'Personal list access denied'; end if;
  return jsonb_build_object('conflict',true,'entity',case when old.id is null then null else to_jsonb(old) end);
 end if;

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
 if entity_kind<>'trip' and not exists(select 1 from entities where id=apply_change.trip_id and kind='trip' and not deleted) then raise exception 'Trip no longer exists'; end if;
 if entity_kind='trip' then
  if actor_role<>'owner' then raise exception 'Owner access required to change trip settings'; end if;
  if old.id is null then payload=jsonb_set(payload,'{people}',jsonb_build_array(jsonb_build_object('id',actor,'name','You','role','owner')));
  elsif payload->'people' is distinct from old.data->'people' then raise exception 'Memberships must be managed through invitations'; end if;
  if old.id is not null and payload->>'currency'<>old.data->>'currency' then raise exception 'Base currency is immutable'; end if;
 end if;
 if is_deleted and entity_kind='trip' then raise exception 'Trip deletion not supported'; end if;
 if old.deleted or (old.id is not null and old.version<>base_version) or (old.id is null and base_version<>0) then return jsonb_build_object('conflict',true,'entity',case when old.id is null then null else to_jsonb(old) end); end if;
 if not is_deleted and entity_kind='entry' and payload->>'sourceIdeaId' is not null then
  if not exists(select 1 from entities i where i.id::text=payload->>'sourceIdeaId' and i.trip_id=apply_change.trip_id and i.kind='idea') then raise exception 'Idea not found in this trip'; end if;
  if exists(select 1 from entities e where e.trip_id=apply_change.trip_id and e.kind='entry' and not e.deleted and e.id<>entity_id and e.data->>'sourceIdeaId'=payload->>'sourceIdeaId') then
   return jsonb_build_object('conflict',true,'entity',case when old.id is null then null else to_jsonb(old) end);
  end if;
 end if;
 if not is_deleted then perform public.validate_payload(entity_kind,payload,trip_id); end if;
 insert into entities(id,trip_id,kind,data,version,updated_by,deleted) values(entity_id,trip_id,entity_kind,payload,coalesce(old.version,0)+1,actor,is_deleted) on conflict(id) do update set data=excluded.data,version=excluded.version,updated_by=actor,updated_at=now(),deleted=excluded.deleted returning * into fresh;
 result=jsonb_build_object('conflict',false,'entity',to_jsonb(fresh));
 insert into operation_receipts values(op_id,actor,entity_id,result);
 return result;
end $$;


create or replace function public.manage_member(target_trip uuid,target_user uuid,new_role text) returns void language plpgsql security definer set search_path=public,extensions as $$
declare target_email text;
begin
 if public.trip_role(target_trip) is distinct from 'owner' then raise exception 'Owner access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_trip::text,0));
 if exists(select 1 from memberships where trip_id=target_trip and user_id=target_user and role='owner') then raise exception 'Cannot revoke owner'; end if;
 select email into target_email from memberships where trip_id=target_trip and user_id=target_user;
 if new_role is null then
  update invitations set revoked=true where trip_id=target_trip and email=target_email and accepted_at is null;
  delete from memberships where trip_id=target_trip and user_id=target_user;
 elsif new_role in ('editor','viewer') then update memberships set role=new_role where trip_id=target_trip and user_id=target_user;
 else raise exception 'Invalid role'; end if;
 -- Retain the participant ID in financial history after revocation.
end $$;

create or replace function public.create_invitation(target_trip uuid,target_email text,invite_role text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare token text=encode(gen_random_bytes(32),'hex');
begin
 perform pg_advisory_xact_lock(hashtextextended(target_trip::text,0));
 if public.trip_role(target_trip) is distinct from 'owner' then raise exception 'Owner access required'; end if;
 if not exists(select 1 from entities where id=target_trip and kind='trip' and not deleted) then raise exception 'Trip no longer exists'; end if;
 target_email=lower(trim(target_email));
 if target_email is null or length(target_email)>320 or invite_role is null or invite_role not in ('editor','viewer') or target_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid invitation'; end if;
 if (select count(*) from invitations where trip_id=target_trip and created_by=auth.uid() and expires_at>now() and not revoked and accepted_at is null)>=50 then raise exception 'Too many pending invitations'; end if;
 insert into invitations(trip_id,email,role,token_hash,created_by) values(target_trip,lower(trim(target_email)),invite_role,encode(digest(token,'sha256'),'hex'),auth.uid());
 return jsonb_build_object('token',token);
end $$;

-- An authenticated client cannot allocate arbitrary rate-limit keys or increase service quotas.
create or replace function public.consume_limit(bucket_name text,max_hits int default 30) returns boolean
language plpgsql security definer set search_path=public,extensions as $$
declare n int; cap int;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if bucket_name is null or bucket_name not in ('places','place','nearby','route','matrix','ai','rate') then raise exception 'Unsupported service bucket'; end if;
 cap=case when bucket_name='ai' then 4 else 20 end;
 if max_hits is null or max_hits<1 then raise exception 'Invalid service limit'; end if;
 cap=least(cap,max_hits);
 insert into service_limits values(auth.uid(),bucket_name,date_trunc('minute',now()),1)
 on conflict(user_id,bucket) do update set window_start=date_trunc('minute',now()),hits=case when service_limits.window_start=date_trunc('minute',now()) then least(service_limits.hits,30)+1 else 1 end returning hits into n;
 return n<=cap;
end $$;

-- Explicitly put the temporary schema last on privileged functions.
alter function public.trip_role(uuid) set search_path=public,extensions,pg_temp;
alter function public.assert_money(numeric) set search_path=public,extensions,pg_temp;
alter function public.validate_payload(text,jsonb,uuid) set search_path=public,extensions,pg_temp;
alter function public.apply_change(uuid,uuid,uuid,text,bigint,jsonb,boolean) set search_path=public,extensions,pg_temp;
alter function public.create_invitation(uuid,text,text) set search_path=public,extensions,pg_temp;
alter function public.accept_invitation(text) set search_path=public,extensions,pg_temp;
alter function public.revoke_invitation(uuid) set search_path=public,extensions,pg_temp;
alter function public.manage_member(uuid,uuid,text) set search_path=public,extensions,pg_temp;
alter function public.consume_limit(text,int) set search_path=public,extensions,pg_temp;
alter function public.delete_trip(uuid,bigint) set search_path=public,extensions,pg_temp;
alter function public.accept_trip_invitation(uuid) set search_path=public,extensions,pg_temp;
alter function public.my_trip_invitations() set search_path=public,extensions,pg_temp;
alter function public.validate_idea_entity() set search_path=public,extensions,pg_temp;
