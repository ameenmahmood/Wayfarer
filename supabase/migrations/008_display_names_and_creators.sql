-- Public account names contain no email addresses. Auth user IDs remain the identity.
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(char_length(display_name) between 1 and 60 and display_name !~ '[[:cntrl:]@]'),
 updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

-- Do not guess who created old records from their most recent editor.
alter table public.entities add column created_by uuid references auth.users(id) on delete set null;
alter table public.entities add column created_at timestamptz;
create function public.stamp_entity_creator() returns trigger language plpgsql
set search_path=pg_catalog,public,pg_temp as $$
begin
 if TG_OP='INSERT' then NEW.created_by=auth.uid(); NEW.created_at=now();
 else NEW.created_by=OLD.created_by; NEW.created_at=OLD.created_at; end if;
 return NEW;
end $$;
revoke execute on function public.stamp_entity_creator() from public,anon,authenticated;
create trigger entity_creator before insert or update on public.entities for each row execute function public.stamp_entity_creator();

create policy profile_read on public.profiles for select to authenticated using (
 user_id=auth.uid()
 or exists(select 1 from public.memberships m where m.user_id=profiles.user_id and public.trip_role(m.trip_id) is not null)
 or exists(select 1 from public.entities e where (e.created_by=profiles.user_id or e.updated_by=profiles.user_id) and public.trip_role(e.trip_id) is not null)
);
create function public.set_display_name(new_name text) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid=auth.uid(); clean text;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if new_name is null or new_name ~ '[[:cntrl:]@]' then raise exception 'Use a display name, not an email address or control characters'; end if;
 clean=regexp_replace(btrim(new_name),'[[:space:]]+',' ','g');
 if char_length(clean) not between 1 and 60 then raise exception 'Display name must be 1–60 characters'; end if;
 insert into public.profiles(user_id,display_name) values(actor,clean)
 on conflict(user_id) do update set display_name=excluded.display_name,updated_at=now();
 return jsonb_build_object('user_id',actor,'display_name',clean);
end $$;
revoke execute on function public.set_display_name(text) from public,anon;
grant execute on function public.set_display_name(text) to authenticated;
alter publication supabase_realtime add table public.profiles;
