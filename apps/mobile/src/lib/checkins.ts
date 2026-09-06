import { supabase } from './supabase';
import type { CheckIn, ItineraryDay, ItineraryItem, Trip } from '../types';
import { utcToLocalParts } from './time';

export async function listCheckIns(trip: Trip): Promise<CheckIn[]> {
  const { data, error } = await supabase
    .from('check_ins')
    .select('id, trip_id, item_id, user_id, status, checked_at, note, profiles(display_name)')
    .eq('trip_id', trip.id)
    .order('checked_at');
  if (error) throw error;
  return (data ?? []) as unknown as CheckIn[];
}

/** Mark an item done for the current user (or update an existing check-in). */
export async function checkIn(trip: Trip, item: ItineraryItem, status: 'done' | 'skipped' = 'done'): Promise<CheckIn> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error('You are signed out.');
  const { data, error } = await supabase
    .from('check_ins')
    .upsert(
      { trip_id: trip.id, item_id: item.id, user_id: userId, status, checked_at: new Date().toISOString() },
      { onConflict: 'item_id,user_id' },
    )
    .select('id, trip_id, item_id, user_id, status, checked_at, note, profiles(display_name)')
    .single();
  if (error) throw error;
  return data as unknown as CheckIn;
}

export async function undoCheckIn(checkInId: string) {
  const { error } = await supabase.from('check_ins').delete().eq('id', checkInId);
  if (error) throw error;
}

/** Today's date as seen in the zone the trip is currently in. */
export function todayInTrip(days: ItineraryDay[], items: ItineraryItem[], deviceZone: string): string {
  // Prefer the zone of the most recent item at or before now, else the device's.
  const now = Date.now();
  let zone = deviceZone;
  let best = -Infinity;
  for (const item of items) {
    if (!item.starts_at || !item.starts_tz) continue;
    const t = Date.parse(item.starts_at);
    if (t <= now && t > best) {
      best = t;
      zone = item.starts_tz;
    }
  }
  if (best === -Infinity) {
    const first = items.find((i) => i.starts_tz);
    if (first?.starts_tz) zone = first.starts_tz;
  }
  try {
    return utcToLocalParts(new Date(now).toISOString(), zone).date;
  } catch {
    return utcToLocalParts(new Date(now).toISOString(), deviceZone).date;
  }
}

/** Progress for a set of items given the trip's check-ins. */
export function progressOf(items: ItineraryItem[], checkIns: CheckIn[]) {
  const doneIds = new Set(checkIns.map((c) => c.item_id));
  const done = items.filter((i) => doneIds.has(i.id)).length;
  return { done, total: items.length };
}

/** The first item not yet done whose time is at or after now (or untimed on today), if any. */
export function upNext(items: ItineraryItem[], checkIns: CheckIn[], todayDayId: string | null): ItineraryItem | null {
  const doneIds = new Set(checkIns.map((c) => c.item_id));
  const now = Date.now();
  const timed = items
    .filter((i) => !doneIds.has(i.id) && i.starts_at && Date.parse(i.starts_at) >= now - 30 * 60 * 1000)
    .sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!));
  if (timed.length > 0) return timed[0];
  if (todayDayId) {
    const untimedToday = items.find((i) => !doneIds.has(i.id) && i.day_id === todayDayId && !i.starts_at);
    if (untimedToday) return untimedToday;
  }
  return null;
}
