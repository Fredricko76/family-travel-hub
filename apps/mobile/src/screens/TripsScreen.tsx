import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Chip, Field, Notice } from '../components/ui';
import { colors, spacing } from '../theme';
import type { Trip } from '../types';
import { formatDayHeading, parseDmy, toDmy } from '../lib/format';
import { errorMessage } from '../lib/errors';

type Props = { onOpenTrip: (trip: Trip) => void };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function TripsScreen({ onOpenTrip }: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [progress, setProgress] = useState<Map<string, { done: number; total: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 86400000);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('trips')
      .select('*')
      .order('start_date', { ascending: false });
    if (loadError) setError(loadError.message);
    else setTrips((data ?? []) as Trip[]);
    // Progress per trip: items vs items with at least one check-in.
    const [itemsRes, checksRes] = await Promise.all([
      supabase.from('itinerary_items').select('id, trip_id'),
      supabase.from('check_ins').select('item_id, trip_id'),
    ]);
    const map = new Map<string, { done: number; total: number }>();
    for (const row of (itemsRes.data ?? []) as { id: string; trip_id: string }[]) {
      const p = map.get(row.trip_id) ?? { done: 0, total: 0 };
      p.total += 1;
      map.set(row.trip_id, p);
    }
    const seen = new Set<string>();
    for (const row of (checksRes.data ?? []) as { item_id: string; trip_id: string }[]) {
      if (seen.has(row.item_id)) continue;
      seen.add(row.item_id);
      const p = map.get(row.trip_id);
      if (p) p.done += 1;
    }
    setProgress(map);
    setLoading(false);
  }, []);

  const todayIso = isoDate(new Date());
  function statusOf(trip: Trip): { text: string; tone: 'neutral' | 'accent' | 'done' } {
    if (trip.end_date < todayIso) return { text: 'Finished', tone: 'neutral' };
    if (trip.start_date <= todayIso) return { text: 'On now', tone: 'accent' };
    return { text: 'Upcoming', tone: 'done' };
  }

  useEffect(() => {
    load();
  }, [load]);

  async function createTrip() {
    setCreating(true);
    setError(null);
    try {
      // Dates are optional: leave both blank and the first itinerary you upload sets them.
      const hasDates = startDate.trim() !== '' || endDate.trim() !== '';
      let start = isoDate(today);
      let end = start;
      if (hasDates) {
        const s = parseDmy(startDate);
        const e = parseDmy(endDate || startDate);
        if (!s || !e) throw new Error('Dates must be day/month/year, like 12/10/2026, or left blank.');
        if (e < s) throw new Error('The end date is before the start date.');
        start = s;
        end = e;
      }
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('You are signed out.');
      const { data, error: insertError } = await supabase
        .from('trips')
        .insert({
          name: name.trim() || 'Our holiday',
          destination: destination.trim() || null,
          start_date: start,
          end_date: end,
          created_by: userId,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      setShowForm(false);
      setName('');
      setDestination('');
      await load();
      onOpenTrip(data as Trip);
    } catch (err) {
      setError(errorMessage(err, 'Could not create the trip.'));
    } finally {
      setCreating(false);
    }
  }

  const { width } = useWindowDimensions();
  const columns = width >= 640 ? 2 : 1;
  const onNow = trips.filter((t) => statusOf(t).text === 'On now').length;
  const upcoming = trips.filter((t) => statusOf(t).text === 'Upcoming').length;
  const summary =
    trips.length === 0
      ? ''
      : [
          `${trips.length} trip${trips.length === 1 ? '' : 's'}`,
          onNow ? `${onNow} on now` : null,
          upcoming ? `${upcoming} coming up` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>DASHBOARD</Text>
          <Text style={styles.title}>Your trips</Text>
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        </View>
        <Pressable onPress={() => supabase.auth.signOut()} accessibilityRole="button">
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>

      {error && <Notice text={error} tone="danger" />}

      {showForm ? (
        <View style={styles.form}>
          <Field label="Trip name" value={name} onChangeText={setName} placeholder="Bali, October" autoFocus />
          <Field label="Destination (optional)" value={destination} onChangeText={setDestination} placeholder="Filled in from your itinerary if left blank" />
          <Text style={styles.hint}>Dates are optional. Leave them blank and the first itinerary you upload will set them.</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label="Start (day/month/year)" value={startDate} onChangeText={setStartDate} placeholder="12/10/2026" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.flex}>
              <Field label="End (day/month/year)" value={endDate} onChangeText={setEndDate} placeholder="19/10/2026" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <Button title="Create trip" onPress={createTrip} loading={creating} />
          <Button title="Cancel" variant="secondary" onPress={() => setShowForm(false)} />
        </View>
      ) : (
        <Button title="New trip" onPress={() => setShowForm(true)} />
      )}

      <FlatList
        key={`cols-${columns}`}
        data={trips}
        numColumns={columns}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.list}
        columnWrapperStyle={columns > 1 ? styles.rowWrap : undefined}
        ListEmptyComponent={
          loading ? null : <Text style={styles.empty}>No trips yet. Create one to start uploading bookings.</Text>
        }
        renderItem={({ item }) => {
          const status = statusOf(item);
          const p = progress.get(item.id) ?? { done: 0, total: 0 };
          const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <Pressable
              style={[styles.card, columns > 1 && styles.cardHalf, status.text === 'On now' && styles.cardOnNow]}
              onPress={() => onOpenTrip(item)}
              accessibilityRole="button"
            >
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, styles.flex]} numberOfLines={2}>{item.name}</Text>
                <Chip text={status.text} tone={status.tone} />
              </View>
              {item.destination ? <Text style={styles.cardPlace}>{item.destination}</Text> : null}
              <Text style={styles.cardMeta}>
                {formatDayHeading(item.start_date)} to {formatDayHeading(item.end_date)}
              </Text>
              <View style={styles.barRow}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }, status.text === 'Finished' && styles.barFinished]} />
                </View>
                <Text style={styles.barText}>{p.total > 0 ? `${p.done} of ${p.total} done` : 'Nothing planned yet'}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: 64, gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { color: colors.accent, fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  title: { fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  link: { color: colors.accent, fontWeight: '600', paddingBottom: 6 },
  form: { gap: spacing.md, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', gap: spacing.md },
  hint: { color: colors.ink3, fontSize: 12 },
  flex: { flex: 1 },
  summary: { color: colors.ink2, fontSize: 14, marginTop: 2 },
  list: { gap: spacing.md, paddingBottom: spacing.xl },
  rowWrap: { gap: spacing.md },
  empty: { color: colors.ink3, textAlign: 'center', marginTop: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, gap: 6 },
  cardHalf: { flex: 1 },
  cardOnNow: { borderColor: colors.accent, borderWidth: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  cardPlace: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  cardMeta: { color: colors.ink2, fontSize: 13 },
  barRow: { gap: 4, marginTop: 4 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.done, borderRadius: 4 },
  barFinished: { backgroundColor: colors.ink3 },
  barText: { color: colors.ink2, fontSize: 12, fontVariant: ['tabular-nums'] },
});
