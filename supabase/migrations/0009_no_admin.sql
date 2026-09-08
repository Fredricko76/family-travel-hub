-- No roles at all: everyone who opens the app (each device has its own
-- anonymous identity) can view, add and edit everything.
create or replace function public.can_view_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
$$;
create or replace function public.can_edit_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
$$;
create or replace function public.is_trip_owner(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
$$;

drop policy if exists "trips: app admins create" on public.trips;
create policy "trips: anyone signed in creates" on public.trips
  for insert to authenticated
  with check (created_by = auth.uid());
