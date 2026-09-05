-- Creating a trip does `insert ... returning *`. Postgres checks the SELECT
-- policy on the returned row before the AFTER INSERT trigger has added the
-- creator to trip_members, so the insert failed with an RLS violation.
-- Let the creator always read their own trip; membership still governs
-- everyone else and every other table.

drop policy "trips: members read" on public.trips;
create policy "trips: members and creator read" on public.trips
  for select to authenticated
  using (public.can_view_trip(id) or created_by = auth.uid());
