import { supabase } from './supabase';
import type { ItineraryItem } from '../types';

/**
 * Places and distances, using OpenStreetMap's free services:
 *   - Nominatim to find where a place is (looked up once, saved on the item)
 *   - OSRM for road distance and driving time between two points
 * Both are public demo services, so lookups are spaced out and cached.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

/** The text worth looking up for an item, or null if there is nothing to go on. */
/** Airports the family is likely to pass through, by IATA code. */
const AIRPORTS: Record<string, { lat: number; lng: number }> = {
  MCO: { lat: 28.4312, lng: -81.3081 }, // Orlando
  TPA: { lat: 27.9755, lng: -82.5332 }, // Tampa
  MIA: { lat: 25.7959, lng: -80.287 }, // Miami
  FLL: { lat: 26.0742, lng: -80.1506 }, // Fort Lauderdale
  EWR: { lat: 40.6895, lng: -74.1745 }, // Newark
  JFK: { lat: 40.6413, lng: -73.7781 }, // New York JFK
  LGA: { lat: 40.7769, lng: -73.874 }, // New York LaGuardia
  LAX: { lat: 33.9416, lng: -118.4085 }, // Los Angeles
  SFO: { lat: 37.6213, lng: -122.379 }, // San Francisco
  DEN: { lat: 39.8561, lng: -104.6737 }, // Denver
  MEL: { lat: -37.669, lng: 144.841 }, // Melbourne
  SYD: { lat: -33.9399, lng: 151.1753 }, // Sydney
};

/** The airport code in a place name like "Orlando International Airport (MCO)", if it is one we know. */
function knownAirport(text: string | null | undefined): string | null {
  if (!text) return null;
  const inBrackets = text.match(/(([A-Z]{3}))/)?.[1];
  const code = inBrackets ?? text.match(/(MCO|TPA|MIA|FLL|EWR|JFK|LGA|LAX|SFO|DEN|MEL|SYD)/)?.[1];
  return code && AIRPORTS[code] ? code : null;
}

export function geocodeQueryFor(item: Pick<ItineraryItem, 'kind' | 'title' | 'location' | 'city'>): string | null {
  if (item.kind === 'flight') return null; // a flight spans two cities; skip
  // An airport is looked up by its code alone. Adding the destination city, as
  // for other places, drags the search into town and the leg comes out tiny.
  const airport = knownAirport(item.location) ?? (item.location ? null : knownAirport(item.title));
  if (airport) return `airport:${airport}`;
  if (item.location && /airport/i.test(item.location)) return item.location.replace(/s*([A-Z]{3})/, '').trim();
  const parts = [item.location?.trim(), item.city?.trim()].filter((p): p is string => !!p);
  if (parts.length === 0 && item.kind === 'stay') parts.push(item.title.trim());
  if (parts.length === 0) return null;
  return [...new Set(parts)].join(', ');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(`${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

/**
 * Look up any items that still need a position and save it. Runs one lookup
 * per second to respect the service, and tries the town alone if the full
 * address finds nothing. Returns the items that changed.
 */
export async function geocodeMissing(items: ItineraryItem[]): Promise<ItineraryItem[]> {
  const changed: ItineraryItem[] = [];
  for (const item of items) {
    const query = geocodeQueryFor(item);
    if (!query) continue;
    if (item.lat != null && item.lng != null && item.geocode_query === query) continue;
    if (item.geocode_query === query && item.lat == null) continue; // looked up before, nothing found
    let found: { lat: number; lng: number } | null = null;
    try {
      found = query.startsWith('airport:') ? AIRPORTS[query.slice('airport:'.length)] ?? null : await nominatim(query);
      if (!found && item.city && query !== item.city) {
        await sleep(1100);
        found = await nominatim(item.city);
      }
    } catch {
      found = null;
    }
    const patch = { lat: found?.lat ?? null, lng: found?.lng ?? null, geocode_query: query };
    const { error } = await supabase.from('itinerary_items').update(patch).eq('id', item.id);
    if (!error) changed.push({ ...item, ...patch });
    await sleep(1100);
  }
  return changed;
}

export type Leg = { metres: number; driveSeconds: number; walkSeconds: number; straightLine: boolean };

const WALK_METRES_PER_SECOND = 1.3; // an easy family pace
const WALKABLE_METRES = 3000; // show a walking time up to this distance

const legCache = new Map<string, Leg | null>();

function haversineMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Road distance and time between two points, with a straight-line fallback. */
export async function legBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<Leg | null> {
  const key = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  if (legCache.has(key)) return legCache.get(key) ?? null;
  const straight = haversineMetres(a, b);
  if (straight < 20) {
    legCache.set(key, null); // same place
    return null;
  }
  let leg: Leg;
  try {
    const res = await fetch(`${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`);
    const data = res.ok ? ((await res.json()) as { routes?: { distance: number; duration: number }[] }) : null;
    const route = data?.routes?.[0];
    if (route) {
      leg = { metres: route.distance, driveSeconds: route.duration, walkSeconds: route.distance / WALK_METRES_PER_SECOND, straightLine: false };
    } else {
      throw new Error('no route');
    }
  } catch {
    leg = { metres: straight, driveSeconds: (straight / 1000 / 45) * 3600, walkSeconds: straight / WALK_METRES_PER_SECOND, straightLine: true };
  }
  legCache.set(key, leg);
  return leg;
}

/** The two halves of a leg line: "12 km" and "about 20 min by car". */
export function legParts(leg: Leg): { distance: string; time: string; note: string } {
  const km = leg.metres / 1000;
  const distance = km < 1 ? `${Math.round(leg.metres / 10) * 10} m` : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  const clock = (seconds: number) => {
    const mins = Math.max(1, Math.round(seconds / 60));
    return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim();
  };
  const car = `${clock(leg.driveSeconds)} by car`;
  const time = leg.metres <= WALKABLE_METRES ? `about ${clock(leg.walkSeconds)} on foot or ${car}` : `about ${car}`;
  return { distance, time, note: leg.straightLine ? ' (straight line)' : '' };
}

export function describeLeg(leg: Leg): string {
  const p = legParts(leg);
  return `${p.distance} · ${p.time}${p.note}`;
}
