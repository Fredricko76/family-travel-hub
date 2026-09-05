/** Display helpers. Times are always shown in the item's own zone. */

export function formatTime(iso: string | null, tz: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz ?? undefined,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export function formatDayHeading(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

// Zones whose IANA city name is not what a traveller calls the place.
const ZONE_ALIASES: Record<string, string> = {
  'Asia/Makassar': 'Bali',
  'Asia/Jakarta': 'Jakarta',
  'Pacific/Auckland': 'NZ',
  'Asia/Ho_Chi_Minh': 'Vietnam',
  'Asia/Kolkata': 'India',
};

export function shortZone(tz: string | null): string {
  if (!tz) return '';
  if (ZONE_ALIASES[tz]) return ZONE_ALIASES[tz];
  const city = tz.split('/').pop() ?? tz;
  return city.replace(/_/g, ' ');
}

export const KIND_LABEL: Record<string, string> = {
  flight: 'Flight',
  stay: 'Stay',
  transport: 'Transport',
  activity: 'Activity',
  meal: 'Meal',
  note: 'Note',
};
