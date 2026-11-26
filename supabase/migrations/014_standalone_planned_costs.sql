-- Independent estimates reuse trip membership, optimistic versions and tombstones.
alter table public.entities drop constraint entities_kind_check;
alter table public.entities add constraint entities_kind_check check(kind in ('trip','entry','expense','repayment','packing','template','idea','plannedCost'));

create function public.validate_planned_cost_entity() returns trigger
language plpgsql set search_path=public,extensions as $$
begin
 if new.kind='plannedCost' and not new.deleted then
  if jsonb_typeof(new.data) is distinct from 'object' or octet_length(new.data::text)>65536 then raise exception 'Invalid or oversized planned cost'; end if;
  if jsonb_typeof(new.data->'title') is distinct from 'string' or length(trim(new.data->>'title')) not between 1 and 200 then raise exception 'Planned cost title required'; end if;
  if coalesce(new.data->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'Invalid planned cost currency'; end if;
  if jsonb_typeof(new.data->'cost') is distinct from 'number' then raise exception 'Invalid planned cost amount'; end if;
  perform public.assert_money((new.data->>'cost')::numeric);
 end if;
 return new;
end $$;
revoke execute on function public.validate_planned_cost_entity() from public,anon,authenticated;
create trigger validate_planned_cost_entity before insert or update on public.entities
for each row execute function public.validate_planned_cost_entity();
