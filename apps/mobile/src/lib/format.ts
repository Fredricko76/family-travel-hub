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

/**
 * One line describing when an item starts and ends, each in its own zone:
 *   flight     "Departs 12:45 Melbourne · Arrives 08:10 Los Angeles"
 *   stay       "Check in 15:00 · Check out Sat 12 Dec 2026 11:00"
 *   anything   "10:00 to 12:30 Bali"
 * The end's date is shown only when it differs from the day the item sits on.
 */
export function describeTimes(
  item: { kind: string; starts_at: string | null; starts_tz: string | null; ends_at: string | null; ends_tz: string | null },
  dayDate: string,
): string {
  const startTz = item.starts_tz ?? 'UTC';
  const endTz = item.ends_tz ?? startTz;
  // A document that gives a date but no time is stored as midnight; show the day, not "00:00".
  const clock = (t: string | null) => (t === '00:00' ? null : t);
  const start = item.starts_at ? clock(formatTime(item.starts_at, startTz)) : null;
  const end = item.ends_at ? clock(formatTime(item.ends_at, endTz)) : null;
  const endDate = item.ends_at ? localDateInZone(item.ends_at, endTz) : null;
  const endDay = endDate && endDate !== dayDate ? formatDayHeading(endDate) : '';
  const endText = [endDay, end].filter(Boolean).join(' ');
  const zoneChanges = item.ends_tz && item.starts_tz && item.ends_tz !== item.starts_tz;

  if (item.kind === 'flight' || item.kind === 'transport') {
    const parts: string[] = [];
    if (start) parts.push(`Departs ${start} ${shortZone(startTz)}`);
    if (endText) parts.push(`Arrives ${endText} ${shortZone(endTz)}`);
    return parts.join(' · ');
  }
  if (item.kind === 'stay') {
    const parts: string[] = [];
    if (start) parts.push(`Check in ${start}`);
    if (endText) parts.push(`Check out ${endText}`);
    return parts.length ? `${parts.join(' · ')} ${shortZone(startTz)}` : '';
  }
  if (start && endText) return `${start} to ${endText} ${zoneChanges ? shortZone(endTz) : shortZone(startTz)}`;
  if (start) return `${start} ${shortZone(startTz)} time`;
  if (endText) return `Until ${endText} ${shortZone(endTz)}`;
  return '';
}

function localDateInZone(iso: string, tz: string): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return dtf.format(new Date(iso)); // en-CA gives YYYY-MM-DD
  } catch {
    return iso.slice(0, 10);
  }
}

export const KIND_LABEL: Record<string, string> = {
  flight: 'Flight',
  stay: 'Stay',
  transport: 'Transport',
  activity: 'Activity',
  meal: 'Meal',
  note: 'Note',
};
