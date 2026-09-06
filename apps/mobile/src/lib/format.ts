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

/** "2026-10-12" -> "Mon 12 Oct 2026" */
export function formatDayHeading(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(date)
    .replace(',', '');
}

/** "2026-10-12" -> "12/10/2026" (day/month/year, as typed in Australia). */
export function toDmy(yyyyMmDd: string | null | undefined): string {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}/.test(yyyyMmDd)) return '';
  const [y, m, d] = yyyyMmDd.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Accepts "12/10/2026", "12-10-2026", "12.10.2026", "12/10/26" or "2026-10-12"
 * and returns "2026-10-12", or null if it is not a real date.
 */
export function parseDmy(input: string): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/.exec(s);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
    if (y < 100) y += 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
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
