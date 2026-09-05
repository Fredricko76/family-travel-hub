-- Family Travel Hub · initial schema for the technical spike
-- Covers: profiles, trips, membership with roles, documents, extractions,
-- itinerary days and items, row-level security, and a private storage bucket.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.trip_role as enum ('owner', 'editor', 'viewer');
create type public.document_status as enum ('uploading', 'queued', 'ready_for_review', 'accepted', 'declined', 'failed');
create type public.item_kind as enum ('flight', 'stay', 'transport', 'activity', 'meal', 'note');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  home_tz       text not null default 'Australia/Melbourne',
  created_at    timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Trips and membership
-- ---------------------------------------------------------------------------
create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  destination text,
  start_date  date not null,
  end_date    date not null,
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.trip_members (
  trip_id      uuid not null references public.trips (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.trip_role not null default 'viewer',
  is_traveller boolean not null default true,
  joined_at    timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- Role lookup used by every policy. SECURITY DEFINER so policies on
-- trip_members do not recurse into themselves.
create or replace function public.trip_role_of(p_trip uuid)
returns public.trip_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.trip_members
  where trip_id = p_trip and user_id = auth.uid()
$$;

create or replace function public.can_view_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.trip_role_of(p_trip) is not null
$$;

create or replace function public.can_edit_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.trip_role_of(p_trip) in ('owner', 'editor')
$$;

create or replace function public.is_trip_owner(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.trip_role_of(p_trip) = 'owner'
$$;

-- The creator becomes the owner automatically.
create or replace function public.handle_new_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role, is_traveller)
  values (new.id, new.created_by, 'owner', true);
  return new;
end;
$$;

create trigger on_trip_created
  after insert on public.trips
  for each row execute function public.handle_new_trip();

-- ---------------------------------------------------------------------------
-- Itinerary
-- ---------------------------------------------------------------------------
create table public.itinerary_days (
  id        uuid primary key default gen_random_uuid(),
  trip_id   uuid not null references public.trips (id) on delete cascade,
  day_date  date not null,
  headline  text,
  unique (trip_id, day_date)
);

-- Keep one day row per date in the trip range.
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
  return new;
end;
$$;

create trigger on_trip_dates
  after insert or update of start_date, end_date on public.trips
  for each row execute function public.sync_itinerary_days();

create table public.itinerary_items (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  day_id       uuid not null references public.itinerary_days (id) on delete cascade,
  kind         public.item_kind not null default 'activity',
  title        text not null,
  starts_at    timestamptz,          -- absolute instant
  starts_tz    text,                 -- IANA zone the item is displayed in
  ends_at      timestamptz,
  ends_tz      text,
  location     text,
  notes        text,
  sort_order   integer not null default 0,
  document_id  uuid,                 -- source document, if extracted
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);

create index on public.itinerary_items (trip_id, day_id, sort_order);

-- ---------------------------------------------------------------------------
-- Documents and extractions
-- ---------------------------------------------------------------------------
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips (id) on delete cascade,
  uploaded_by    uuid not null references auth.users (id),
  storage_path   text,                          -- <trip_id>/<document_id>.<ext>
  original_name  text,
  mime_type      text,
  size_bytes     bigint,
  status         public.document_status not null default 'uploading',
  error_message  text,
  created_at     timestamptz not null default now()
);

create index on public.documents (trip_id, created_at desc);

create table public.extractions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  model         text not null,
  result        jsonb not null,                 -- schema-validated model output
  warnings      text[] not null default '{}',
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

alter table public.itinerary_items
  add constraint itinerary_items_document_fk
  foreign key (document_id) references public.documents (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_members    enable row level security;
alter table public.itinerary_days  enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.documents       enable row level security;
alter table public.extractions     enable row level security;

-- profiles: you can read anyone you share a trip with, edit only yourself
create policy "profiles: read self and co-members" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.trip_members me
      join public.trip_members them on them.trip_id = me.trip_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- trips
create policy "trips: members read" on public.trips
  for select to authenticated using (public.can_view_trip(id));
create policy "trips: anyone creates own" on public.trips
  for insert to authenticated with check (created_by = auth.uid());
create policy "trips: editors update" on public.trips
  for update to authenticated using (public.can_edit_trip(id)) with check (public.can_edit_trip(id));
create policy "trips: owner deletes" on public.trips
  for delete to authenticated using (public.is_trip_owner(id));

-- trip_members
create policy "members: members read" on public.trip_members
  for select to authenticated using (public.can_view_trip(trip_id));
create policy "members: owner manages" on public.trip_members
  for all to authenticated using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));

-- itinerary
create policy "days: members read" on public.itinerary_days
  for select to authenticated using (public.can_view_trip(trip_id));
create policy "days: editors update" on public.itinerary_days
  for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create policy "items: members read" on public.itinerary_items
  for select to authenticated using (public.can_view_trip(trip_id));
create policy "items: editors write" on public.itinerary_items
  for all to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

-- documents
create policy "documents: members read" on public.documents
  for select to authenticated using (public.can_view_trip(trip_id));
create policy "documents: editors insert own" on public.documents
  for insert to authenticated
  with check (public.can_edit_trip(trip_id) and uploaded_by = auth.uid());
create policy "documents: editors update" on public.documents
  for update to authenticated
  using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy "documents: editors delete" on public.documents
  for delete to authenticated using (public.can_edit_trip(trip_id));

-- extractions: readable by members; written only by the Edge Function (service role)
create policy "extractions: members read" on public.extractions
  for select to authenticated
  using (exists (
    select 1 from public.documents d
    where d.id = extractions.document_id and public.can_view_trip(d.trip_id)
  ));

-- ---------------------------------------------------------------------------
-- Realtime: the app subscribes to changes on these tables
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.itinerary_items, public.documents;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, path is <trip_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 26214400,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do nothing;

create policy "documents bucket: members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and public.can_view_trip(((storage.foldername(name))[1])::uuid)
  );

create policy "documents bucket: editors upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.can_edit_trip(((storage.foldername(name))[1])::uuid)
  );

create policy "documents bucket: editors delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.can_edit_trip(((storage.foldername(name))[1])::uuid)
  );
