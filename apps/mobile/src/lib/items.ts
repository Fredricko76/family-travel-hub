import { supabase } from './supabase';
import type { ItemKind, ItineraryDay, ItineraryItem, Trip } from '../types';
import { deviceZone, isValidZone, localToUtcIso, TIME_RE } from './time';
import { parseDmy, toDmy } from './format';

export type ItemInput = {
  kind: ItemKind;
  title: string;
  date: string; // as typed: day/month/year (2026-10-12 also accepted)
  time: string; // HH:MM or '' for no set time
  tz: string; // IANA zone the item is displayed in
  endDate: string; // optional: day/month/year the item ends, if not the same day
  endTime: string; // optional: HH:MM it ends or arrives
  endTz: string; // optional: zone of the end, if different (arrival city)
  location: string;
  notes: string;
};

/** Validate the form and turn it into a row ready for insert/update. */
export function buildItemRow(trip: Trip, days: ItineraryDay[], input: ItemInput) {
  const title = input.title.trim();
  if (!title) throw new Error('Give the item a title.');
  const isoDate = parseDmy(input.date);
  if (!isoDate) throw new Error('Day must be day/month/year, like 14/10/2026.');
  const day = days.find((d) => d.day_date === isoDate);
  if (!day) throw new Error(`${toDmy(isoDate)} is outside this trip (${toDmy(trip.start_date)} to ${toDmy(trip.end_date)}).`);
  const time = input.time.trim();
  if (time && !TIME_RE.test(time)) throw new Error('Time must be 24-hour, like 09:30 or 18:00.');
  const tz = input.tz.trim() || deviceZone();
  if (!isValidZone(tz)) throw new Error(`"${tz}" is not a known time zone. Try Australia/Melbourne or Asia/Makassar.`);

  // Optional end / arrival: its own day and zone, defaulting to the start's.
  const endTime = input.endTime.trim();
  const endDateText = input.endDate.trim();
  const endTz = input.endTz.trim() || tz;
  let ends_at: string | null = null;
  let ends_tz: string | null = null;
  if (endTime || endDateText) {
    const endIso = endDateText ? parseDmy(endDateText) : isoDate;
    if (!endIso) throw new Error('End day must be day/month/year, like 15/10/2026.');
    if (endTime && !TIME_RE.test(endTime)) throw new Error('End time must be 24-hour, like 11:00.');
    if (!isValidZone(endTz)) throw new Error(`"${endTz}" is not a known time zone.`);
    ends_at = localToUtcIso(endIso, endTime || '00:00', endTz);
    ends_tz = endTz;
    const startsAt = time ? localToUtcIso(isoDate, time, tz) : null;
    if (startsAt && ends_at < startsAt) throw new Error('It ends before it starts. Check the end day, time and zone.');
  }

  return {
    trip_id: trip.id,
    day_id: day.id,
    kind: input.kind,
    title,
    starts_at: time ? localToUtcIso(isoDate, time, tz) : null,
    starts_tz: tz,
    ends_at,
    ends_tz,
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
