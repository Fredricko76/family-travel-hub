import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Field, Notice } from '../components/ui';
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
    setLoading(false);
  }, []);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR TRIPS</Text>
          <Text style={styles.title}>Holidays</Text>
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
        data={trips}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : <Text style={styles.empty}>No trips yet. Create one to start uploading bookings.</Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onOpenTrip(item)} accessibilityRole="button">
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardMeta}>
              {item.destination ? `${item.destination} · ` : ''}
              {formatDayHeading(item.start_date)} to {formatDayHeading(item.end_date)}
            </Text>
          </Pressable>
        )}
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
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  empty: { color: colors.ink3, textAlign: 'center', marginTop: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  cardMeta: { color: colors.ink2, fontSize: 14 },
});
