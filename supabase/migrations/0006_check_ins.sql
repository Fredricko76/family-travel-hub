-- Check-ins: anyone on the trip can mark an itinerary item as done.
create type public.check_in_status as enum ('done', 'skipped');

create table if not exists public.check_ins (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  item_id     uuid not null references public.itinerary_items (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  status      public.check_in_status not null default 'done',
  checked_at  timestamptz not null default now(),
  note        text,
  lat         double precision,
  lng         double precision,
  unique (item_id, user_id)
);

create index if not exists check_ins_trip_idx on public.check_ins (trip_id, checked_at desc);

alter table public.check_ins enable row level security;

create policy "check_ins: members read" on public.check_ins
  for select to authenticated using (public.can_view_trip(trip_id));
create policy "check_ins: members add own" on public.check_ins
  for insert to authenticated
  with check (public.can_view_trip(trip_id) and user_id = auth.uid());
create policy "check_ins: own or admin update" on public.check_ins
  for update to authenticated
  using (user_id = auth.uid() or public.can_edit_trip(trip_id))
  with check (user_id = auth.uid() or public.can_edit_trip(trip_id));
create policy "check_ins: own or admin delete" on public.check_ins
  for delete to authenticated
  using (user_id = auth.uid() or public.can_edit_trip(trip_id));

alter publication supabase_realtime add table public.check_ins;
