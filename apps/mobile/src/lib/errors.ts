/** Human-readable text from anything thrown: Error, Supabase error objects, strings. */
export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [e.message, e.details, e.hint].filter((p): p is string => typeof p === 'string' && p.length > 0);
    if (parts.length) return parts.join(' · ');
  }
  if (typeof err === 'string' && err) return err;
  return fallback;
}
