-- The family's own photo for each day's banner, stored in the photos bucket
-- at <trip_id>/day-banners/<day_id>.<ext>. Null shows a plain box.
alter table public.itinerary_days add column if not exists banner_path text;
