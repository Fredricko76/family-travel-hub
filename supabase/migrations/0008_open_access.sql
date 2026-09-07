-- Open access: anyone who opens the app (each device gets an anonymous
-- identity automatically) can see every trip, check in and add photos.
-- Editing stays with trip admins and the app admin.
create or replace function public.can_view_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
$$;

-- Anonymous visitors have no email; give their profile a friendly name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Family member'),
    new.email
  );

  insert into public.trip_members (trip_id, user_id, role, is_traveller)
  select i.trip_id, new.id, i.role, true
  from public.invites i
  where new.email is not null and lower(i.email) = lower(new.email) and i.accepted_at is null
  on conflict (trip_id, user_id) do nothing;

  update public.invites set accepted_at = now()
  where new.email is not null and lower(email) = lower(new.email) and accepted_at is null;

  return new;
end;
$$;
