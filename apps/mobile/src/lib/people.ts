import { supabase } from './supabase';
import type { Invite, Member, Trip, TripRole } from '../types';

export async function myRole(trip: Trip): Promise<TripRole | null> {
  const { data, error } = await supabase.rpc('trip_role_of', { p_trip: trip.id });
  if (error) throw error;
  return (data as TripRole | null) ?? null;
}

export async function listMembers(trip: Trip): Promise<Member[]> {
  const { data, error } = await supabase
    .from('trip_members')
    .select('trip_id, user_id, role, is_traveller, profiles(display_name, email)')
    .eq('trip_id', trip.id)
    .order('joined_at');
  if (error) throw error;
  return (data ?? []) as unknown as Member[];
}

export async function listInvites(trip: Trip): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('trip_id', trip.id)
    .is('accepted_at', null)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as Invite[];
}

/**
 * Add someone by email. If they already have an account they join now;
 * otherwise an invite waits for them to sign up with that email.
 */
export async function addMemberByEmail(trip: Trip, email: string, role: 'editor' | 'viewer'): Promise<'added' | 'invited'> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('That does not look like an email address.');
  const { data, error } = await supabase.rpc('add_member_by_email', { p_trip: trip.id, p_email: clean, p_role: role });
  if (error) throw error;
  const row = (data as { status: string }[] | null)?.[0];
  return row?.status === 'added' ? 'added' : 'invited';
}

export async function setMemberRole(trip: Trip, userId: string, role: 'editor' | 'viewer') {
  const { error } = await supabase.from('trip_members').update({ role }).eq('trip_id', trip.id).eq('user_id', userId);
  if (error) throw error;
}

export async function removeMember(trip: Trip, userId: string) {
  const { error } = await supabase.from('trip_members').delete().eq('trip_id', trip.id).eq('user_id', userId);
  if (error) throw error;
}

export async function cancelInvite(inviteId: string) {
  const { error } = await supabase.from('invites').delete().eq('id', inviteId);
  if (error) throw error;
}
