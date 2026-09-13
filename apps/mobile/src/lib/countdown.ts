import { useEffect, useState } from 'react';

export type Countdown = { months: number; weeks: number; days: number; hours: number; minutes: number; passed: boolean };

/**
 * Time left until a moment, the way people say it: whole calendar months
 * first, then weeks, days, hours and minutes out of what remains.
 */
export function countdownTo(target: Date, now: Date = new Date()): Countdown {
  if (target.getTime() <= now.getTime()) return { months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, passed: true };
  // Step forward a calendar month at a time while it still fits.
  let months = 0;
  const cursor = new Date(now.getTime());
  for (;;) {
    const next = new Date(cursor.getTime());
    next.setMonth(next.getMonth() + 1);
    if (next.getTime() > target.getTime()) break;
    cursor.setTime(next.getTime());
    months += 1;
    if (months > 240) break; // never loop forever on a wild date
  }
  let rest = Math.floor((target.getTime() - cursor.getTime()) / 60000); // whole minutes
  const weeks = Math.floor(rest / (7 * 24 * 60));
  rest -= weeks * 7 * 24 * 60;
  const days = Math.floor(rest / (24 * 60));
  rest -= days * 24 * 60;
  const hours = Math.floor(rest / 60);
  const minutes = rest - hours * 60;
  return { months, weeks, days, hours, minutes, passed: false };
}

/** A countdown that ticks over every half minute. */
export function useCountdown(target: Date | null): Countdown | null {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, [target]);
  return target ? countdownTo(target, now) : null;
}

export const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`;
