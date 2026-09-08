import type { ItineraryDay, ItineraryItem } from '../types';
import { utcToLocalParts } from './time';

/** An item that is a multi-day cruise: the ship is home for those days. */
export function isCruise(item: Pick<ItineraryItem, 'title' | 'starts_at' | 'ends_at'>): boolean {
  if (!/\bcruise\b/i.test(item.title) || !item.starts_at || !item.ends_at) return false;
  return Date.parse(item.ends_at) - Date.parse(item.starts_at) >= 36 * 3600 * 1000;
}

/** "Celebrity Xcel Caribbean cruise from Miami" -> "Celebrity Xcel" */
export function shipNameFor(title: string): string {
  const cleaned = title
    .replace(/\s+(caribbean|mediterranean|alaska|alaskan|pacific|atlantic|baltic|norwegian fjords|river|ocean)?\s*cruise\b.*$/i, '')
    .replace(/\s+from\b.*$/i, '')
    .trim();
  return cleaned || title;
}

function localDate(iso: string, tz: string | null): string {
  try {
    return utcToLocalParts(iso, tz ?? 'UTC').date;
  } catch {
    return iso.slice(0, 10);
  }
}

export type CruiseDay = {
  ship: ItineraryItem;
  shipName: string;
  /** The port visited that day, or null when at sea. */
  port: string | null;
  boarding: boolean;
  leaving: boolean;
};

/** If a cruise covers this day, say which ship and whether it's a port day or a sea day. */
export function cruiseDayFor(day: ItineraryDay, items: ItineraryItem[]): CruiseDay | null {
  const ship = items.find((i) => isCruise(i) && localDate(i.starts_at!, i.starts_tz) <= day.day_date && localDate(i.ends_at!, i.ends_tz ?? i.starts_tz) >= day.day_date);
  if (!ship) return null;
  const from = localDate(ship.starts_at!, ship.starts_tz);
  const to = localDate(ship.ends_at!, ship.ends_tz ?? ship.starts_tz);
  const boarding = day.day_date === from;
  const leaving = day.day_date === to;
  const portItem = items.find((i) => i.day_id === day.id && i.id !== ship.id && !!i.city && !isCruise(i));
  const port = portItem?.city ?? (boarding || leaving ? ship.city : null);
  return { ship, shipName: shipNameFor(ship.title), port, boarding, leaving };
}
