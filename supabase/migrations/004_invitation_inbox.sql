-- Pending invitations are visible only to their authenticated recipient.
-- Return safe metadata, never invitation tokens/hashes or trip contents.
create function public.my_trip_invitations()
returns table(id uuid,trip_title text,role text,expires_at timestamptz)
language sql stable security definer set search_path=public,extensions as $$
 select i.id,coalesce(e.data->>'title','Private trip'),i.role,i.expires_at
 from invitations i join entities e on e.id=i.trip_id and e.kind='trip' and not e.deleted
 where auth.uid() is not null and i.email=lower(auth.jwt()->>'email')
 and not i.revoked and i.accepted_at is null and i.expires_at>now()
 order by i.expires_at,i.id;
$$;

create function public.accept_trip_invitation(invitation_id uuid) returns uuid
language plpgsql security definer set search_path=public,extensions as $$
declare inv invitations; e entities;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into inv from invitations where id=invitation_id;
 if inv.id is null then raise exception 'Invitation is invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(inv.trip_id::text,0));
 select * into inv from invitations i where i.id=invitation_id for update;
 if inv.id is null or inv.revoked or inv.expires_at<=now()
 or (auth.jwt()->>'email') is null or lower(auth.jwt()->>'email')<>inv.email then
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

-- Existing shared links use the same authorization and retry behavior.
create or replace function public.accept_invitation(invite_token text) returns uuid
language plpgsql security definer set search_path=public,extensions as $$
declare invitation_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select id into invitation_id from invitations where token_hash=encode(digest(invite_token,'sha256'),'hex');
 if invitation_id is null then raise exception 'Invitation is invalid'; end if;
 return public.accept_trip_invitation(invitation_id);
end $$;
revoke all on function public.my_trip_invitations() from public,anon;
revoke all on function public.accept_trip_invitation(uuid) from public,anon;
grant execute on function public.my_trip_invitations() to authenticated;
grant execute on function public.accept_trip_invitation(uuid) to authenticated;
