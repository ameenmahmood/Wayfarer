-- Return JSON null for records that were never created, so offline conflict resolution can discard them cleanly.
create or replace function public.apply_change(op_id uuid,entity_id uuid,trip_id uuid,entity_kind text,base_version bigint,payload jsonb,is_deleted boolean default false) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor uuid=auth.uid(); actor_role text; old entities; fresh entities; receipt operation_receipts; result jsonb;
begin
 if actor is null then raise exception 'Authentication required'; end if;
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
 if entity_kind='trip' then
  if actor_role<>'owner' then raise exception 'Owner access required to change trip settings'; end if;
  if old.id is null then payload=jsonb_set(payload,'{people}',jsonb_build_array(jsonb_build_object('id',actor,'name','You','role','owner')));
  elsif payload->'people' is distinct from old.data->'people' then raise exception 'Memberships must be managed through invitations'; end if;
  if old.id is not null and payload->>'currency'<>old.data->>'currency' then raise exception 'Base currency is immutable'; end if;
 end if;
 if is_deleted and entity_kind='trip' then raise exception 'Trip deletion not supported'; end if;
 if old.deleted or (old.id is not null and old.version<>base_version) or (old.id is null and base_version<>0) then return jsonb_build_object('conflict',true,'entity',case when old.id is null then null else to_jsonb(old) end); end if;
 if not is_deleted then perform public.validate_payload(entity_kind,payload,trip_id); end if;
 insert into entities(id,trip_id,kind,data,version,updated_by,deleted) values(entity_id,trip_id,entity_kind,payload,coalesce(old.version,0)+1,actor,is_deleted) on conflict(id) do update set data=excluded.data,version=excluded.version,updated_by=actor,updated_at=now(),deleted=excluded.deleted returning * into fresh;
 result=jsonb_build_object('conflict',false,'entity',to_jsonb(fresh));
 insert into operation_receipts values(op_id,actor,entity_id,result);
 return result;
end $$;

