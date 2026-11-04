-- Replace the writer before removing memberships for trips that never existed.
-- JSON comparison keeps malformed legacy tombstones from breaking authenticated reads.
alter policy entity_read on public.entities using (
 public.trip_role(trip_id) is not null and (
  kind not in ('packing','template')
  or coalesce(nullif(data->'personal','null'::jsonb),'false'::jsonb)='false'::jsonb
  or data->>'assigned'=auth.uid()::text
 )
);

create or replace function public.apply_change(op_id uuid,entity_id uuid,trip_id uuid,entity_kind text,base_version bigint,payload jsonb,is_deleted boolean default false) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
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
 if old.id is not null and (old.trip_id<>trip_id or old.kind<>entity_kind) then raise exception 'Record unavailable'; end if;
 if old.kind in ('packing','template')
 and coalesce(nullif(old.data->'personal','null'::jsonb),'false'::jsonb)<>'false'::jsonb
 and old.data->>'assigned' is distinct from actor::text then
  raise exception 'Personal list access denied';
 end if;
 -- Deletion wins over offline writes and old operation receipts.
 if exists(select 1 from entities t where t.id=apply_change.trip_id and t.kind='trip' and t.deleted) then
  if actor_role is null or actor_role='viewer' then raise exception 'Editor access required'; end if;
  return jsonb_build_object('conflict',true,'entity',case when old.id is null then null else to_jsonb(old) end);
 end if;

 if old.id is null and entity_kind='trip' and entity_id=trip_id then
  if actor_role is not null then raise exception 'Trip already exists'; end if;
  if base_version<>0 then return jsonb_build_object('conflict',true,'entity',null); end if;
  actor_role='owner';
 end if;
 if actor_role is null or actor_role='viewer' then raise exception 'Editor access required'; end if;
 select * into receipt from operation_receipts r where r.op_id=apply_change.op_id;
 if receipt.op_id is not null then
  if receipt.user_id<>actor or receipt.entity_id<>entity_id then raise exception 'Operation identity mismatch'; end if;
  return receipt.result;
 end if;
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
 if is_deleted then
  -- Retain the original visibility and never trust the body of a deletion.
  payload=coalesce(old.data,'{}'::jsonb);
 else
  perform public.validate_payload(entity_kind,payload,trip_id);
 end if;
 if old.id is null then
  -- Another trip can concurrently claim the same globally unique entity ID.
  insert into entities(id,trip_id,kind,data,version,updated_by,deleted)
  values(entity_id,trip_id,entity_kind,payload,1,actor,is_deleted)
  on conflict(id) do nothing returning * into fresh;
  if fresh.id is null then raise exception 'Record unavailable'; end if;
  if entity_kind='trip' then
   insert into memberships values(trip_id,actor,lower(auth.jwt()->>'email'),'owner');
  end if;
 else
  update entities set data=payload,version=old.version+1,updated_by=actor,
   updated_at=now(),deleted=is_deleted where id=old.id returning * into fresh;
 end if;
 result=jsonb_build_object('conflict',false,'entity',to_jsonb(fresh));
 insert into operation_receipts values(op_id,actor,entity_id,result);
 return result;
end $$;

-- Take the same per-trip lock as the writer and recheck after waiting.
do $$
declare missing_trip uuid;
begin
 for missing_trip in
  select distinct m.trip_id from public.memberships m
  where not exists(select 1 from public.entities e where e.id=m.trip_id and e.kind='trip')
 loop
  perform pg_advisory_xact_lock(hashtextextended(missing_trip::text,0));
  if not exists(select 1 from public.entities where id=missing_trip and kind='trip') then
   delete from public.memberships where trip_id=missing_trip;
  end if;
 end loop;
end $$;
