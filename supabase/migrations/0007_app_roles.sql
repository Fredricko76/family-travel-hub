-- App-level roles on top of per-trip roles.
--   admin: creates trips, manages users, edits everything
--   member: sees the trips they are on, checks in, adds photos
alter table public.profiles
  add column if not exists app_role text not null default 'member'
  check (app_role in ('admin', 'member'));

-- The first account becomes the app admin.
update public.profiles set app_role = 'admin'
where id = (select id from auth.users order by created_at asc limit 1);

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select app_role = 'admin' from public.profiles where id = auth.uid()), false)
$$;
revoke execute on function public.is_app_admin() from public, anon;

-- Only app admins create trips.
drop policy if exists "trips: anyone creates own" on public.trips;
create policy "trips: app admins create" on public.trips
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_app_admin());

-- App admins can see every profile (for the users list) and every trip.
create policy "profiles: app admins read all" on public.profiles
  for select to authenticated using (public.is_app_admin());
create policy "profiles: app admins update all" on public.profiles
  for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "trips: members and creator read" on public.trips;
create policy "trips: members, creator and app admins read" on public.trips
  for select to authenticated
  using (public.can_view_trip(id) or created_by = auth.uid() or public.is_app_admin());

-- App admins act as admins on every trip without needing a membership row.
create or replace function public.can_edit_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.trip_role_of(p_trip) in ('owner', 'editor') or public.is_app_admin()
$$;
create or replace function public.can_view_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.trip_role_of(p_trip) is not null or public.is_app_admin()
$$;
create or replace function public.is_trip_owner(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.trip_role_of(p_trip) = 'owner' or public.is_app_admin()
$$;
