import { supabase } from './supabase';
import type { ItemKind, ItineraryDay, ItineraryItem, Trip } from '../types';
import { DATE_RE, deviceZone, isValidZone, localToUtcIso, TIME_RE } from './time';

export type ItemInput = {
  kind: ItemKind;
  title: string;
  date: string; // YYYY-MM-DD, must be a day of the trip
  time: string; // HH:MM or '' for no set time
  tz: string; // IANA zone the item is displayed in
  location: string;
  notes: string;
};

/** Validate the form and turn it into a row ready for insert/update. */
export function buildItemRow(trip: Trip, days: ItineraryDay[], input: ItemInput) {
  const title = input.title.trim();
  if (!title) throw new Error('Give the item a title.');
  if (!DATE_RE.test(input.date)) throw new Error('Date must look like 2026-10-14.');
  const day = days.find((d) => d.day_date === input.date);
  if (!day) throw new Error(`${input.date} is outside this trip (${trip.start_date} to ${trip.end_date}).`);
  const time = input.time.trim();
  if (time && !TIME_RE.test(time)) throw new Error('Time must be 24-hour, like 09:30 or 18:00.');
  const tz = input.tz.trim() || deviceZone();
  if (!isValidZone(tz)) throw new Error(`"${tz}" is not a known time zone. Try Australia/Melbourne or Asia/Makassar.`);
  return {
    trip_id: trip.id,
    day_id: day.id,
    kind: input.kind,
    title,
    starts_at: time ? localToUtcIso(input.date, time, tz) : null,
    starts_tz: tz,
    location: input.location.trim() || null,
    notes: input.notes.trim() || null,
  };
}

export async function createItem(trip: Trip, days: ItineraryDay[], input: ItemInput): Promise<ItineraryItem> {
  const row = buildItemRow(trip, days, input);
  const { data: authData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('itinerary_items')
    .insert({ ...row, sort_order: 0, created_by: authData.user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as ItineraryItem;
}

export async function updateItem(
  trip: Trip,
  days: ItineraryDay[],
  itemId: string,
  input: ItemInput,
): Promise<ItineraryItem> {
  const row = buildItemRow(trip, days, input);
  const { data, error } = await supabase.from('itinerary_items').update(row).eq('id', itemId).select().single();
  if (error) throw error;
  return data as ItineraryItem;
}

/**
 * Best guess at the zone for a new item: the zone of items already on that
 * day, else the nearest item elsewhere in the trip, else this device's zone.
 */
export function inferZone(day: ItineraryDay, days: ItineraryDay[], items: ItineraryItem[]): string {
  const sameDay = items.find((i) => i.day_id === day.id && i.starts_tz);
  if (sameDay?.starts_tz) return sameDay.starts_tz;
  const dateOf = new Map(days.map((d) => [d.id, d.day_date]));
  const target = Date.parse(day.day_date);
  type Candidate = { distance: number; before: boolean; at: number; tz: string };
  let best: Candidate | null = null;
  for (const item of items) {
    const date = dateOf.get(item.day_id);
    if (!date || !item.starts_tz) continue;
    const dayMs = Date.parse(date);
    const c: Candidate = {
      distance: Math.abs(dayMs - target),
      before: dayMs < target,
      at: item.starts_at ? Date.parse(item.starts_at) : 0,
      tz: item.starts_tz,
    };
    if (!best || c.distance < best.distance) {
      best = c;
      continue;
    }
    if (c.distance !== best.distance) continue;
    // Same distance: on an earlier day prefer where the day ended (latest item);
    // on a later day prefer where it began (earliest item); earlier day beats later.
    if (c.before && !best.before) best = c;
    else if (c.before === best.before && (c.before ? c.at > best.at : c.at < best.at)) best = c;
  }
  return best?.tz ?? deviceZone();
}
