-- Tasks to complete before (or during) the trip: a shared list anyone on the
-- trip can add to and tick off. Opened from the welcome page.
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 200),
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     uuid references auth.users (id) on delete set null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists tasks_trip_idx on public.tasks (trip_id, position, created_at);

alter table public.tasks enable row level security;

create policy "tasks: members read" on public.tasks
  for select to authenticated using (public.can_view_trip(trip_id));
create policy "tasks: members add" on public.tasks
  for insert to authenticated with check (public.can_view_trip(trip_id));
create policy "tasks: members update" on public.tasks
  for update to authenticated
  using (public.can_view_trip(trip_id)) with check (public.can_view_trip(trip_id));
create policy "tasks: members delete" on public.tasks
  for delete to authenticated using (public.can_view_trip(trip_id));

alter publication supabase_realtime add table public.tasks;
