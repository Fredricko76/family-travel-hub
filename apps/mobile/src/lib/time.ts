/**
 * Time zone helpers built on Intl only, so they work on iOS, Android and web
 * without a date library. Every itinerary item stores an absolute instant
 * plus the IANA zone it is displayed in.
 */

function partsIn(utcMs: number, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Offset of `tz` from UTC at the given instant, in minutes (east positive). */
export function zoneOffsetMinutes(utcMs: number, tz: string): number {
  const w = partsIn(utcMs, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** "2026-10-12" + "10:05" in `tz` -> ISO instant. Handles daylight saving. */
export function localToUtcIso(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - zoneOffsetMinutes(guess, tz) * 60000;
  utc = guess - zoneOffsetMinutes(utc, tz) * 60000; // second pass settles DST edges
  return new Date(utc).toISOString();
}

/** ISO instant -> { date: "YYYY-MM-DD", time: "HH:MM" } as seen in `tz`. */
export function utcToLocalParts(iso: string, tz: string): { date: string; time: string } {
  const w = partsIn(Date.parse(iso), tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}` };
}

export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
