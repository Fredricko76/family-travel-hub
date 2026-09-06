import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Chip, Field, Notice } from './ui';
import { colors, spacing } from '../theme';
import { ROLE_LABEL, type Invite, type Member, type Trip } from '../types';
import { addMemberByEmail, cancelInvite, listInvites, listMembers, removeMember, setMemberRole } from '../lib/people';
import { confirm } from '../lib/confirm';
import { errorMessage } from '../lib/errors';

type Props = { trip: Trip; demo: boolean; canEdit: boolean; myUserId: string | null };

const demoMembers: Member[] = [
  { trip_id: 'demo-trip', user_id: 'demo-user', role: 'owner', is_traveller: true, profiles: { display_name: 'You', email: 'you@example.com' } },
  { trip_id: 'demo-trip', user_id: 'demo-2', role: 'viewer', is_traveller: false, profiles: { display_name: 'Grandma', email: 'grandma@example.com' } },
];

export function PeopleTab({ trip, demo, canEdit, myUserId }: Props) {
  const [members, setMembers] = useState<Member[]>(demo ? demoMembers : []);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (demo) return;
    try {
      const [m, i] = await Promise.all([listMembers(trip), canEdit ? listInvites(trip) : Promise.resolve([])]);
      setMembers(m);
      setInvites(i);
    } catch (err) {
      setError(errorMessage(err, 'Could not load people.'));
    }
  }, [trip, demo, canEdit]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (demo) return;
    const channel = supabase
      .channel(`members-${trip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter: `trip_id=eq.${trip.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [trip.id, demo, load]);

  async function add() {
    setError(null);
    setNotice(null);
    if (demo) {
      setNotice('Sign in to add people to a real trip.');
      return;
    }
    setBusy(true);
    try {
      const outcome = await addMemberByEmail(trip, email, role);
      setNotice(
        outcome === 'added'
          ? `${email.trim()} has been added as ${role === 'editor' ? 'an admin' : 'a member'}.`
          : `${email.trim()} doesn't have an account yet. They'll join this trip automatically when they sign up with that email.`,
      );
      setEmail('');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not add that person.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(m: Member) {
    const next = m.role === 'viewer' ? 'editor' : 'viewer';
    try {
      await setMemberRole(trip, m.user_id, next);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not change the role.'));
    }
  }

  async function remove(m: Member) {
    const who = m.profiles?.display_name ?? m.profiles?.email ?? 'this person';
    const ok = await confirm('Remove from trip?', `${who} will no longer see this trip.`, 'Remove');
    if (!ok) return;
    try {
      await removeMember(trip, m.user_id);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not remove them.'));
    }
  }

  async function cancel(i: Invite) {
    try {
      await cancelInvite(i.id);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not cancel the invite.'));
    }
  }

  return (
    <View style={styles.wrap}>
      {canEdit && (
        <View style={styles.card}>
          <Text style={styles.heading}>Add someone</Text>
          <Field label="Their email" value={email} onChangeText={setEmail} placeholder="name@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <View style={styles.roles}>
            {(['viewer', 'editor'] as const).map((r) => (
              <Pressable key={r} onPress={() => setRole(r)} accessibilityRole="radio" accessibilityState={{ selected: role === r }} style={[styles.roleChip, role === r && styles.roleChipOn]}>
                <Text style={[styles.roleText, role === r && styles.roleTextOn]}>{r === 'editor' ? 'Admin' : 'Member'}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {role === 'editor'
              ? 'Admins can upload plans, edit the itinerary, add people and photos.'
              : 'Members can view the plan and take and upload photos.'}
          </Text>
          <Button title="Add" onPress={add} loading={busy} disabled={!email.trim()} />
          {notice && <Notice text={notice} tone="accent" />}
        </View>
      )}
      {error && <Notice text={error} tone="danger" />}

      <Text style={styles.heading}>On this trip</Text>
      {members.map((m) => {
        const name = m.profiles?.display_name ?? m.profiles?.email ?? 'Someone';
        const isMe = m.user_id === myUserId;
        return (
          <View key={m.user_id} style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.name}>
                {name}
                {isMe ? ' (you)' : ''}
              </Text>
              {m.profiles?.email && m.profiles.email !== name ? <Text style={styles.meta}>{m.profiles.email}</Text> : null}
            </View>
            <Chip text={ROLE_LABEL[m.role]} tone={m.role === 'viewer' ? 'neutral' : 'accent'} />
            {canEdit && m.role !== 'owner' && !isMe && (
              <View style={styles.rowActions}>
                <Pressable onPress={() => toggleRole(m)} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.link}>{m.role === 'viewer' ? 'Make admin' : 'Make member'}</Text>
                </Pressable>
                <Pressable onPress={() => remove(m)} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      {canEdit && invites.length > 0 && (
        <>
          <Text style={styles.heading}>Waiting to sign up</Text>
          {invites.map((i) => (
            <View key={i.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.name}>{i.email}</Text>
                <Text style={styles.meta}>Will join as {ROLE_LABEL[i.role]} when they create an account</Text>
              </View>
              <Pressable onPress={() => cancel(i)} accessibilityRole="button" hitSlop={6}>
                <Text style={styles.remove}>Cancel</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  heading: { fontWeight: '700', color: colors.ink, fontSize: 16 },
  roles: { flexDirection: 'row', gap: 6 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface2 },
  roleChipOn: { backgroundColor: colors.accent },
  roleText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  roleTextOn: { color: '#fff' },
  hint: { color: colors.ink3, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  flex: { flex: 1 },
  name: { fontWeight: '600', color: colors.ink },
  meta: { color: colors.ink3, fontSize: 12 },
  rowActions: { alignItems: 'flex-end', gap: 4 },
  link: { color: colors.accent, fontWeight: '600', fontSize: 12 },
  remove: { color: colors.ink3, fontSize: 12 },
});
