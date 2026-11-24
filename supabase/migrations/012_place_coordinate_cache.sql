-- Only the fields with an explicit caching exception are persisted.
create table public.place_coordinate_cache (
 place_id text primary key check(length(place_id) between 1 and 300),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 expires_at timestamptz not null default now()+interval '29 days'
);
create index on public.place_coordinate_cache(expires_at);
alter table public.place_coordinate_cache enable row level security;
revoke all on public.place_coordinate_cache from public,anon,authenticated;
grant all on public.place_coordinate_cache to service_role;

create function public.get_place_coordinates(target_user uuid, target_place text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare cached place_coordinate_cache%rowtype;
begin
 if not exists(select 1 from paid_feature_access where user_id=target_user and approved) then
  return jsonb_build_object('approved',false);
 end if;
 select * into cached from place_coordinate_cache where place_id=target_place and expires_at>clock_timestamp();
 if not found then return jsonb_build_object('approved',true); end if;
 return jsonb_build_object('approved',true,'location',jsonb_build_object('latitude',cached.latitude,'longitude',cached.longitude));
end $$;

create function public.store_place_coordinates(target_place text, lat double precision, lng double precision)
returns void language sql security definer set search_path=public,extensions,pg_temp as $$
 insert into place_coordinate_cache(place_id,latitude,longitude,expires_at)
 values(target_place,lat,lng,clock_timestamp()+interval '29 days')
 on conflict(place_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,expires_at=excluded.expires_at;
$$;
revoke all on function public.get_place_coordinates(uuid,text),public.store_place_coordinates(text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.get_place_coordinates(uuid,text),public.store_place_coordinates(text,double precision,double precision) to service_role;

-- Hosted scheduler: excluded only by embedded PostgreSQL tests without pg_cron.
-- A 29-day TTL plus hourly deletion leaves margin below Google's 30-day maximum.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('wayfarer-expire-place-coordinates','0 * * * *',
 $$delete from public.place_coordinate_cache where expires_at<=now();$$);
