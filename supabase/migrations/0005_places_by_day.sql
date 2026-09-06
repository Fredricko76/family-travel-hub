-- Items carry the town/city they happen in, so days can be headed by place.
alter table public.itinerary_items add column if not exists city text;

-- When trip dates change, drop empty days that now fall outside the range
-- (days that still hold items are kept so nothing is lost).
create or replace function public.sync_itinerary_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.itinerary_days (trip_id, day_date)
  select new.id, d::date
  from generate_series(new.start_date, new.end_date, interval '1 day') as d
  on conflict (trip_id, day_date) do nothing;

  delete from public.itinerary_days d
  where d.trip_id = new.id
    and (d.day_date < new.start_date or d.day_date > new.end_date)
    and not exists (select 1 from public.itinerary_items i where i.day_id = d.id);

  return new;
end;
$$;
