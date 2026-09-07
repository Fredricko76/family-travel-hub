import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Field, Notice } from './ui';
import { colors, spacing } from '../theme';
import type { Trip } from '../types';
import { confirm } from '../lib/confirm';
import { errorMessage } from '../lib/errors';
import {
  deleteUser,
  inviteUser,
  listUsers,
  setAppRole,
  setUserTrips,
  signInLink,
  type AppRole,
  type AppUser,
  type TripAssignment,
} from '../lib/users';

/** Shows a sign-in link with Copy and Share, for the admin to pass on. */
function LinkCard({ name, link, onClose }: { name: string; link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const canShare = Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const message = `Hi ${name}, here's your link to the family travel hub. Open it on your phone and you're in, no password needed. Then add it to your home screen: ${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Family Travel Hub', text: message });
    } catch {
      // cancelled
    }
  }

  return (
    <View style={styles.linkCard}>
      <Text style={styles.heading}>Send this to {name}</Text>
      <Text style={styles.hint}>
        Opening it signs them in on that phone and keeps them signed in, no password. It works once and for about an hour, so send it when they can open it straight away. You can make a new one any time.
      </Text>
      <Text style={styles.linkText} selectable numberOfLines={3}>{link}</Text>
      <View style={styles.linkButtons}>
        <View style={styles.flex}>
          <Button title={copied ? 'Copied' : 'Copy message'} onPress={copy} />
        </View>
        {canShare && (
          <View style={styles.flex}>
            <Button title="Share…" variant="secondary" onPress={share} />
          </View>
        )}
      </View>
      <Button title="Done" variant="secondary" onPress={onClose} />
    </View>
  );
}

type Props = { trips: Trip[]; myUserId: string | null };

const ROLE_HINT: Record<AppRole, string> = {
  admin: 'Admin: creates trips, adds users, edits everything.',
  member: 'User: sees the trips they are on, checks in, takes and uploads photos.',
};

function TripPicker({ trips, value, onChange }: { trips: Trip[]; value: TripAssignment[]; onChange: (v: TripAssignment[]) => void }) {
  const on = new Set(value.map((t) => t.trip_id));
  return (
    <View style={styles.picker}>
      <Text style={styles.label}>On these trips</Text>
      {trips.length === 0 && <Text style={styles.hint}>No trips yet. Create one first.</Text>}
      {trips.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => onChange(on.has(t.id) ? value.filter((v) => v.trip_id !== t.id) : [...value, { trip_id: t.id, role: 'viewer' }])}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: on.has(t.id) }}
          style={styles.pickRow}
        >
          <View style={[styles.box, on.has(t.id) && styles.boxOn]}>{on.has(t.id) && <Text style={styles.boxMark}>✓</Text>}</View>
          <Text style={styles.pickText}>{t.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function UsersPanel({ trips, myUserId }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('member');
  const [assign, setAssign] = useState<TripAssignment[]>([]);
  const [linkResult, setLinkResult] = useState<{ name: string; link: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(errorMessage(err, 'Could not load users.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setName('');
    setEmail('');
    setRole('member');
    setAssign([]);
    setShowForm(false);
  }

  async function add() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await inviteUser({ email, display_name: name, app_role: role, trips: assign });
      setLinkResult({ name: name.trim(), link: result.link });
      resetForm();
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not add that person.'));
    } finally {
      setBusy(false);
    }
  }

  function openEdit(u: AppUser) {
    setError(null);
    setNotice(null);
    setEditing(u);
    setAssign(u.trips.filter((t) => t.role !== 'owner').map((t) => ({ trip_id: t.trip_id, role: t.role === 'editor' ? 'editor' : 'viewer' })));
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await setUserTrips(editing.id, assign);
      setNotice(`${editing.display_name ?? editing.email} updated.`);
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  async function newLink(u: AppUser) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await signInLink(u.id);
      setEditing(null);
      setLinkResult({ name: u.display_name ?? u.email ?? 'them', link: result.link });
    } catch (err) {
      setError(errorMessage(err, 'Could not make a link.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(u: AppUser) {
    setError(null);
    try {
      await setAppRole(u.id, u.app_role === 'admin' ? 'member' : 'admin');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not change the role.'));
    }
  }

  async function remove(u: AppUser) {
    const ok = await confirm('Remove this user?', `${u.display_name ?? u.email} will no longer be able to sign in. Their photos and check-ins stay.`, 'Remove');
    if (!ok) return;
    setError(null);
    try {
      await deleteUser(u.id);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not remove them.'));
    }
  }

  const tripName = (id: string) => trips.find((t) => t.id === id)?.name ?? 'a trip';

  return (
    <View style={styles.wrap}>
      {error && <Notice text={error} tone="danger" />}
      {notice && <Notice text={notice} tone="accent" />}

      {linkResult && <LinkCard name={linkResult.name} link={linkResult.link} onClose={() => setLinkResult(null)} />}

      {showForm ? (
        <View style={styles.card}>
          <Text style={styles.heading}>Add a user</Text>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Grandma Sue" autoFocus />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="sue@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="off" />
          <Text style={styles.hint}>You'll get a link to send them. Opening it signs them in, and their phone stays signed in.</Text>
          <View style={styles.roles}>
            {(['member', 'admin'] as const).map((r) => (
              <Pressable key={r} onPress={() => setRole(r)} accessibilityRole="radio" accessibilityState={{ selected: role === r }} style={[styles.roleChip, role === r && styles.roleChipOn]}>
                <Text style={[styles.roleText, role === r && styles.roleTextOn]}>{r === 'admin' ? 'Admin' : 'User'}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{ROLE_HINT[role]}</Text>
          {role === 'member' && <TripPicker trips={trips} value={assign} onChange={setAssign} />}
          <Button title="Add user and make their link" onPress={add} loading={busy} disabled={!name.trim() || !email.trim()} />
          <Button title="Cancel" variant="secondary" onPress={resetForm} disabled={busy} />
        </View>
      ) : (
        <Button title="Add a user" onPress={() => setShowForm(true)} />
      )}

      {editing && (
        <View style={styles.card}>
          <Text style={styles.heading}>{editing.display_name ?? editing.email}</Text>
          <Text style={styles.hint}>{editing.email}</Text>
          {editing.app_role === 'member' ? (
            <TripPicker trips={trips} value={assign} onChange={setAssign} />
          ) : (
            <Text style={styles.hint}>Admins can see and edit every trip.</Text>
          )}
          <Button title="Save" onPress={saveEdit} loading={busy} />
          <Button title="New sign-in link (new phone or signed out)" variant="secondary" onPress={() => newLink(editing)} disabled={busy} />
          <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} disabled={busy} />
        </View>
      )}

      <Text style={styles.heading}>Everyone</Text>
      {users.map((u) => {
        const isMe = u.id === myUserId;
        const onTrips = u.trips.map((t) => tripName(t.trip_id));
        return (
          <View key={u.id} style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.name}>
                {u.display_name ?? u.email}
                {isMe ? ' (you)' : ''}
              </Text>
              <Text style={styles.meta}>{u.email}</Text>
              <Text style={styles.meta}>
                {u.app_role === 'admin' ? 'Every trip' : onTrips.length ? onTrips.join(', ') : 'Not on any trip yet'}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Chip text={u.app_role === 'admin' ? 'Admin' : 'User'} tone={u.app_role === 'admin' ? 'accent' : 'neutral'} />
              <Pressable onPress={() => openEdit(u)} accessibilityRole="button" hitSlop={6}>
                <Text style={styles.link}>Edit</Text>
              </Pressable>
              {!isMe && (
                <>
                  <Pressable onPress={() => toggleRole(u)} accessibilityRole="button" hitSlop={6}>
                    <Text style={styles.link}>{u.app_role === 'admin' ? 'Make user' : 'Make admin'}</Text>
                  </Pressable>
                  <Pressable onPress={() => remove(u)} accessibilityRole="button" hitSlop={6}>
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  heading: { fontWeight: '700', color: colors.ink, fontSize: 16 },
  label: { fontSize: 13, color: colors.ink2, fontWeight: '600', letterSpacing: 0.3 },
  hint: { color: colors.ink3, fontSize: 12 },
  roles: { flexDirection: 'row', gap: 6 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface2 },
  roleChipOn: { backgroundColor: colors.ink },
  roleText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  roleTextOn: { color: '#fff' },
  picker: { gap: 6 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  boxMark: { color: '#fff', fontWeight: '800', fontSize: 13 },
  pickText: { color: colors.ink, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  flex: { flex: 1 },
  name: { fontWeight: '600', color: colors.ink },
  meta: { color: colors.ink3, fontSize: 12 },
  link: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  remove: { color: colors.ink3, fontSize: 12 },
  linkCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, padding: spacing.md, gap: spacing.sm },
  linkText: { fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 11, color: colors.ink2, backgroundColor: colors.surface2, padding: spacing.sm, borderRadius: 6 },
  linkButtons: { flexDirection: 'row', gap: spacing.sm },
});
