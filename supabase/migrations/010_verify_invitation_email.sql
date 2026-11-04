-- Pending invitations are visible only to their authenticated recipient.
-- Return safe metadata, never invitation tokens/hashes or trip contents.
create or replace function public.my_trip_invitations()
returns table(id uuid,trip_title text,role text,expires_at timestamptz)
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select i.id,coalesce(e.data->>'title','Private trip'),i.role,i.expires_at
 from invitations i join entities e on e.id=i.trip_id and e.kind='trip' and not e.deleted
 join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null
  and i.email=lower(u.email)
 where i.email=lower(auth.jwt()->>'email')
 and not i.revoked and i.accepted_at is null and i.expires_at>now()
 order by i.expires_at,i.id;
$$;

create or replace function public.accept_trip_invitation(invitation_id uuid) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare inv invitations; e entities; verified_email text;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into inv from invitations where id=invitation_id;
 if inv.id is null then raise exception 'Invitation is invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(inv.trip_id::text,0));
 select * into inv from invitations i where i.id=invitation_id for update;
 select lower(u.email) into verified_email from auth.users u
 where u.id=auth.uid() and u.email_confirmed_at is not null;
 if inv.id is null or inv.revoked or inv.expires_at<=now()
 or verified_email is distinct from inv.email or lower(auth.jwt()->>'email') is distinct from inv.email then
  raise exception 'Invitation is invalid, expired, revoked, or issued to another email';
 end if;
 if not exists(select 1 from entities where id=inv.trip_id and kind='trip' and not deleted) then raise exception 'Trip no longer exists'; end if;
 -- A retry after a dropped response is safe, but cannot restore revoked membership.
 if inv.accepted_at is not null then
  if exists(select 1 from memberships where trip_id=inv.trip_id and user_id=auth.uid()) then return inv.trip_id; end if;
  raise exception 'Invitation was already used. Ask the owner for a new invitation';
 end if;
 insert into memberships values(inv.trip_id,auth.uid(),inv.email,inv.role) on conflict do nothing;
 update invitations set accepted_at=now() where id=inv.id;
 select * into e from entities where id=inv.trip_id for update;
 if not exists(select 1 from jsonb_array_elements(e.data->'people') p where p->>'id'=auth.uid()::text) then
  update entities set data=jsonb_set(data,'{people}',(data->'people')||jsonb_build_array(jsonb_build_object('id',auth.uid(),'name',split_part(inv.email,'@',1),'role',inv.role))),version=version+1,updated_at=now(),updated_by=auth.uid() where id=inv.trip_id;
 end if;
 return inv.trip_id;
end $$;

create or replace function public.manage_member(target_trip uuid,target_user uuid,new_role text) returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare target_email text; verified_email text;
begin
 if public.trip_role(target_trip) is distinct from 'owner' then raise exception 'Owner access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_trip::text,0));
 if exists(select 1 from memberships where trip_id=target_trip and user_id=target_user and role='owner') then raise exception 'Cannot revoke owner'; end if;
 if new_role is null then
  select email into target_email from memberships where trip_id=target_trip and user_id=target_user;
  if not found then return; end if;
  select lower(u.email) into verified_email from auth.users u
  where u.id=target_user and u.email_confirmed_at is not null;
  update invitations set revoked=true
  where trip_id=target_trip and email in (target_email,verified_email) and accepted_at is null;
  delete from memberships where trip_id=target_trip and user_id=target_user;
 elsif new_role in ('editor','viewer') then update memberships set role=new_role where trip_id=target_trip and user_id=target_user;
 else raise exception 'Invalid role'; end if;
 -- Retain the participant ID in financial history after revocation.
end $$;
