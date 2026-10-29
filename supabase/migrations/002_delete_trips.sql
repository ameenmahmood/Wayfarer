-- Owner-only, idempotent trip deletion. Retain tombstones for offline conflict protection.
create function public.delete_trip(target_trip uuid, expected_version bigint) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare trip entities; actor uuid=auth.uid();
begin
 if actor is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_trip::text,0));
 if public.trip_role(target_trip) is distinct from 'owner' then raise exception 'Owner access required'; end if;
 select * into trip from entities where id=target_trip and kind='trip' for update;
 if trip.id is null then raise exception 'Trip not found'; end if;
 if trip.deleted then return jsonb_build_object('deleted',true,'trip_id',target_trip); end if;
 if expected_version is null or trip.version<>expected_version then raise exception 'Trip changed. Close and reopen Edit trip before deleting.'; end if;
 update entities set deleted=true,version=version+1,updated_at=now(),updated_by=actor where trip_id=target_trip and not deleted;
 update invitations set revoked=true where trip_id=target_trip;
 return jsonb_build_object('deleted',true,'trip_id',target_trip);
end $$;
revoke execute on function public.delete_trip(uuid,bigint) from public,anon;
grant execute on function public.delete_trip(uuid,bigint) to authenticated;

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
  return jsonb_build_object('conflict',true,'entity',to_jsonb(old));
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
 if old.deleted or (old.id is not null and old.version<>base_version) or (old.id is null and base_version<>0) then return jsonb_build_object('conflict',true,'entity',to_jsonb(old)); end if;
 if not is_deleted then perform public.validate_payload(entity_kind,payload,trip_id); end if;
 insert into entities(id,trip_id,kind,data,version,updated_by,deleted) values(entity_id,trip_id,entity_kind,payload,coalesce(old.version,0)+1,actor,is_deleted) on conflict(id) do update set data=excluded.data,version=excluded.version,updated_by=actor,updated_at=now(),deleted=excluded.deleted returning * into fresh;
 result=jsonb_build_object('conflict',false,'entity',to_jsonb(fresh));
 insert into operation_receipts values(op_id,actor,entity_id,result);
 return result;
end $$;

create or replace function public.create_invitation(target_trip uuid,target_email text,invite_role text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare token text=encode(gen_random_bytes(32),'hex');
begin
 perform pg_advisory_xact_lock(hashtextextended(target_trip::text,0));
 if not exists(select 1 from entities where id=target_trip and kind='trip' and not deleted) then raise exception 'Trip no longer exists'; end if;
 if public.trip_role(target_trip)<>'owner' or public.trip_role(target_trip) is null then raise exception 'Owner access required'; end if;
 if invite_role not in ('editor','viewer') or target_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid invitation'; end if;
 if (select count(*) from invitations where trip_id=target_trip and created_by=auth.uid() and expires_at>now() and not revoked)>50 then raise exception 'Too many pending invitations'; end if;
 insert into invitations(trip_id,email,role,token_hash,created_by) values(target_trip,lower(trim(target_email)),invite_role,encode(digest(token,'sha256'),'hex'),auth.uid());
 return jsonb_build_object('token',token);
end $$;
create or replace function public.accept_invitation(invite_token text) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare inv invitations; e entities;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into inv from invitations where token_hash=encode(digest(invite_token,'sha256'),'hex');
 if inv.id is null then raise exception 'Invitation is invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(inv.trip_id::text,0));
 select * into inv from invitations i where i.id=inv.id for update;
 if not exists(select 1 from entities where id=inv.trip_id and kind='trip' and not deleted) then raise exception 'Trip no longer exists'; end if;
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
