-- Paid access is separate from trip ownership. Nobody is approved automatically.
create table public.paid_feature_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 approved boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.paid_service_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default true,
 monthly_cents integer not null default 1000 check(monthly_cents between 0 and 1000),
 daily_cents integer not null default 300 check(daily_cents between 0 and 1000),
 user_daily_cents integer not null default 300 check(user_daily_cents between 0 and 1000)
);
insert into public.paid_service_settings(id) values(true);
create table public.paid_service_usage (
 scope text not null,
 window_start timestamptz not null,
 hits integer not null default 0,
 cents integer not null default 0,
 primary key(scope,window_start)
);
create table public.paid_service_leases (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null
);
alter table public.paid_feature_access enable row level security;
alter table public.paid_service_settings enable row level security;
alter table public.paid_service_usage enable row level security;
alter table public.paid_service_leases enable row level security;
revoke all on public.paid_feature_access,public.paid_service_settings,public.paid_service_usage,public.paid_service_leases from public,anon,authenticated;
grant all on public.paid_feature_access,public.paid_service_settings,public.paid_service_usage,public.paid_service_leases to service_role;

-- Only the Edge Function's service-role client may reserve budget. Client-provided
-- costs, account IDs and clocks are never accepted from public RPC callers.
create function public.reserve_paid_service(target_user uuid, action_name text, matrix_points integer default 0)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
 cfg paid_service_settings%rowtype;
 cost integer;
 clock timestamptz;
 minute_start timestamptz;
 day_start timestamptz;
 month_start timestamptz;
 starts timestamptz[];
 keys text[];
 max_cents integer[];
 max_hits integer[];
 used paid_service_usage%rowtype;
 i integer;
 lease uuid;
begin
 -- Serialize all reservations, including concurrent requests from different users.
 select * into cfg from paid_service_settings where id=true for update;
 clock=clock_timestamp();
 if not found or not cfg.enabled then
  return jsonb_build_object('allowed',false,'reason','Paid features are paused by the site owner.','retry_after',3600);
 end if;
 perform 1 from paid_feature_access where user_id=target_user and approved for share;
 if not found then
  return jsonb_build_object('allowed',false,'approval_required',true,'reason','The site owner must approve your account before you can use paid features.');
 end if;
 -- Conservative reservations in USD cents. Never refunded, even on provider errors.
 cost=case action_name when 'places' then 5 when 'place' then 5 when 'nearby' then 10 when 'route' then 5 when 'map' then 2 else null end;
 if action_name='matrix' then
  if matrix_points is null or matrix_points not between 1 and 12 then raise exception 'Invalid matrix size'; end if;
  cost=2*matrix_points*matrix_points;
 end if;
 if cost is null then raise exception 'Paid service disabled or unsupported'; end if;
 minute_start=date_trunc('minute',clock at time zone 'UTC') at time zone 'UTC';
 day_start=date_trunc('day',clock at time zone 'UTC') at time zone 'UTC';
 month_start=date_trunc('month',clock at time zone 'UTC') at time zone 'UTC';
 keys=array['global:month','global:day','user:'||target_user||':day','global:minute','user:'||target_user||':minute'];
 starts=array[month_start,day_start,day_start,minute_start,minute_start];
 max_cents=array[cfg.monthly_cents,cfg.daily_cents,cfg.user_daily_cents,2147483647,2147483647];
 max_hits=array[2147483647,2147483647,100,30,12];
 for i in 1..5 loop
  select * into used from paid_service_usage where scope=keys[i] and window_start=starts[i];
  if coalesce(used.cents,0)+cost>max_cents[i] or coalesce(used.hits,0)+1>max_hits[i] then
   return jsonb_build_object('allowed',false,'reason',case when i=1 then 'The monthly paid-feature allowance has been reached. Manual planning is still available.' when i<=3 then 'The daily paid-feature allowance has been reached. Manual planning is still available.' else 'Too many paid requests. Try again in a minute.' end,
    'retry_after',greatest(1,ceil(extract(epoch from ((case when i=1 then month_start+interval '1 month' when i<=3 then day_start+interval '1 day' else minute_start+interval '1 minute' end)-clock)))::integer));
  end if;
 end loop;
 delete from paid_service_leases where expires_at<=clock;
 if (select count(*) from paid_service_leases)>=5 or (select count(*) from paid_service_leases where user_id=target_user)>=2 then
  return jsonb_build_object('allowed',false,'reason','Other paid requests are still running. Try again shortly.','retry_after',5);
 end if;
 for i in 1..5 loop
  insert into paid_service_usage(scope,window_start,hits,cents) values(keys[i],starts[i],1,cost)
  on conflict(scope,window_start) do update set hits=paid_service_usage.hits+1,cents=paid_service_usage.cents+cost;
 end loop;
 insert into paid_service_leases(user_id,expires_at) values(target_user,clock+interval '90 seconds') returning id into lease;
 return jsonb_build_object('allowed',true,'lease_id',lease);
end $$;

create function public.release_paid_service(lease_id uuid) returns void
language sql security definer set search_path=public,extensions,pg_temp as $$
 delete from paid_service_leases where id=lease_id;
$$;
revoke all on function public.reserve_paid_service(uuid,text,integer),public.release_paid_service(uuid) from public,anon,authenticated;
grant execute on function public.reserve_paid_service(uuid,text,integer),public.release_paid_service(uuid) to service_role;
