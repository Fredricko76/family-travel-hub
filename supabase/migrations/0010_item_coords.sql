-- Where each itinerary item is, so the plan can show distances between them.
alter table public.itinerary_items
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocode_query text;  -- the text that was looked up, to know when to redo it
