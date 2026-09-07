import { supabase } from './supabase';
import type { Trip, TripRole } from '../types';

export type AppRole = 'admin' | 'member';

export type AppUser = {
  id: string;
  display_name: string | null;
  email: string | null;
  app_role: AppRole;
  trips: { trip_id: string; role: TripRole }[];
};

export type TripAssignment = { trip_id: string; role: 'editor' | 'viewer' };

/** The signed-in person's app-level role. */
export async function myAppRole(): Promise<AppRole> {
  const { data, error } = await supabase.rpc('is_app_admin');
  if (error) throw error;
  return data ? 'admin' : 'member';
}

/** Every user, with the trips they are on. App admins only (row-level security enforces it). */
export async function listUsers(): Promise<AppUser[]> {
  const [profilesRes, membersRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email, app_role').order('display_name'),
    supabase.from('trip_members').select('trip_id, user_id, role'),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (membersRes.error) throw membersRes.error;
  const byUser = new Map<string, { trip_id: string; role: TripRole }[]>();
  for (const m of (membersRes.data ?? []) as { trip_id: string; user_id: string; role: TripRole }[]) {
    byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), { trip_id: m.trip_id, role: m.role }]);
  }
  return ((profilesRes.data ?? []) as Omit<AppUser, 'trips'>[]).map((p) => ({ ...p, trips: byUser.get(p.id) ?? [] }));
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('manage-users', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = await context.json();
        if (parsed?.error) throw new Error(parsed.error);
      } catch (inner) {
        if (inner instanceof Error && !inner.message.includes('JSON')) throw inner;
      }
    }
    throw error;
  }
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
  return data as T;
}

export function createUser(input: {
  email: string;
  display_name: string;
  password: string;
  app_role: AppRole;
  trips: TripAssignment[];
}) {
  return call<{ user_id: string }>({ action: 'create', ...input });
}

export function setAppRole(userId: string, appRole: AppRole) {
  return call<{ ok: true }>({ action: 'set_role', user_id: userId, app_role: appRole });
}

export function setUserTrips(userId: string, trips: TripAssignment[]) {
  return call<{ ok: true }>({ action: 'set_trips', user_id: userId, trips });
}

export function resetPassword(userId: string, password: string) {
  return call<{ ok: true }>({ action: 'reset_password', user_id: userId, password });
}

export function deleteUser(userId: string) {
  return call<{ ok: true }>({ action: 'delete', user_id: userId });
}

/** Trips a user should be offered when assigning: all trips the admin can see. */
export async function listAllTrips(): Promise<Trip[]> {
  const { data, error } = await supabase.from('trips').select('*').order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Trip[];
}
