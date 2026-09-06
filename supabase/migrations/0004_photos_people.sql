-- Photos, member management by email, and role simplification.
-- Roles in the UI are "Admin" (owner or editor) and "Member" (viewer).
-- Admins manage the plan and people; members view and add photos.

-- ---------------------------------------------------------------------------
-- Profiles get an email so member lists can show who is who
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

-- Recreate the signup trigger: store email, and claim any pending invites.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), new.email);

  insert into public.trip_members (trip_id, user_id, role, is_traveller)
  select i.trip_id, new.id, i.role, true
  from public.invites i
  where lower(i.email) = lower(new.email) and i.accepted_at is null
  on conflict (trip_id, user_id) do nothing;

  update public.invites set accepted_at = now()
  where lower(email) = lower(new.email) and accepted_at is null;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites (email-based). Admins add people by email; if the person already
-- has an account they join at once, otherwise they join when they sign up.
-- ---------------------------------------------------------------------------
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  email       text not null,
  role        public.trip_role not null default 'viewer',
  invited_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (trip_id, email)
);

alter table public.invites enable row level security;

create policy "invites: admins manage" on public.invites
  for all to authenticated
  using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

-- Admins (owner or editor) manage members, not just the owner.
drop policy if exists "members: owner manages" on public.trip_members;
create policy "members: admins manage" on public.trip_members
  for all to authenticated
  using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create or replace function public.add_member_by_email(p_trip uuid, p_email text, p_role public.trip_role)
returns table (status text, user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_email text := lower(trim(p_email));
begin
  if not public.can_edit_trip(p_trip) then
    raise exception 'Only an admin of this trip can add people';
  end if;
  if p_role = 'owner' then
    raise exception 'Use editor for an admin; a trip has one owner';
  end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;

  if v_user is not null then
    insert into public.trip_members (trip_id, user_id, role, is_traveller)
    values (p_trip, v_user, p_role, true)
    on conflict (trip_id, user_id) do update set role = excluded.role;
    return query select 'added'::text, v_user;
  else
    insert into public.invites (trip_id, email, role, invited_by)
    values (p_trip, v_email, p_role, auth.uid())
    on conflict (trip_id, email) do update set role = excluded.role, accepted_at = null;
    return query select 'invited'::text, null::uuid;
  end if;
end;
$$;

revoke execute on function public.add_member_by_email(uuid, text, public.trip_role) from public, anon;

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------
create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  uploaded_by   uuid not null references auth.users (id),
  storage_path  text not null,
  taken_at      timestamptz not null default now(),
  caption       text,
  width         integer,
  height        integer,
  created_at    timestamptz not null default now()
);

create index if not exists photos_trip_taken_idx on public.photos (trip_id, taken_at desc);

alter table public.photos enable row level security;

create policy "photos: members read" on public.photos
  for select to authenticated using (public.can_view_trip(trip_id));
create policy "photos: members add own" on public.photos
  for insert to authenticated
  with check (public.can_view_trip(trip_id) and uploaded_by = auth.uid());
create policy "photos: own or admin delete" on public.photos
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.can_edit_trip(trip_id));
create policy "photos: own or admin update" on public.photos
  for update to authenticated
  using (uploaded_by = auth.uid() or public.can_edit_trip(trip_id))
  with check (uploaded_by = auth.uid() or public.can_edit_trip(trip_id));

alter publication supabase_realtime add table public.photos, public.trip_members;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 52428800, array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

create policy "photos bucket: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.can_view_trip(((storage.foldername(name))[1])::uuid));
create policy "photos bucket: members upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.can_view_trip(((storage.foldername(name))[1])::uuid));
create policy "photos bucket: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.can_edit_trip(((storage.foldername(name))[1])::uuid));
