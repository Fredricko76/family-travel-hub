-- Tighten who can call the SECURITY DEFINER helpers over the REST RPC surface.
-- Role checks stay callable by signed-in users (they only report the caller's
-- own membership, and the Edge Function uses can_edit_trip); trigger functions
-- are never meant to be called directly.

revoke execute on function public.trip_role_of(uuid)   from public, anon;
revoke execute on function public.can_view_trip(uuid)  from public, anon;
revoke execute on function public.can_edit_trip(uuid)  from public, anon;
revoke execute on function public.is_trip_owner(uuid)  from public, anon;

revoke execute on function public.handle_new_user()      from public, anon, authenticated;
revoke execute on function public.handle_new_trip()      from public, anon, authenticated;
revoke execute on function public.sync_itinerary_days()  from public, anon, authenticated;
