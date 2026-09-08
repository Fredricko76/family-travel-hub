import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Field, Notice } from './ui';
import { DateField } from './DateField';
import { colors, spacing } from '../theme';
import type { Trip } from '../types';
import { parseDmy, toDmy } from '../lib/format';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';

type Props = { trip: Trip; demo: boolean; onSaved: (trip: Trip) => void; onCancel: () => void };

/** Rename a trip, set its summary line, or change its dates. */
export function TripEditor({ trip, demo, onSaved, onCancel }: Props) {
  const [name, setName] = useState(trip.name);
  const [destination, setDestination] = useState(trip.destination ?? '');
  const [start, setStart] = useState(toDmy(trip.start_date));
  const [end, setEnd] = useState(toDmy(trip.end_date));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const s = parseDmy(start);
    const e = parseDmy(end);
    if (!name.trim()) return setError('Give the trip a name.');
    if (!s || !e) return setError('Dates must be day/month/year, like 09/12/2026.');
    if (e < s) return setError('The end date is before the start date.');
    const patch = { name: name.trim(), destination: destination.trim() || null, start_date: s, end_date: e };
    if (demo) {
      onSaved({ ...trip, ...patch });
      return;
    }
    setBusy(true);
    try {
      const { data, error: updateError } = await supabase.from('trips').update(patch).eq('id', trip.id).select().single();
      if (updateError) throw updateError;
      onSaved(data as Trip);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the trip.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Edit trip</Text>
      <Field label="Trip name" value={name} onChangeText={setName} placeholder="Abu-Elias Family Holiday" autoFocus />
      <Field label="Summary line" value={destination} onChangeText={setDestination} placeholder="USA, the Caribbean and New York" />
      <Text style={styles.hint}>Leave the summary blank and the app writes it from the places you visit.</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <DateField label="Start" value={start} onChange={setStart} />
        </View>
        <View style={styles.flex}>
          <DateField label="End" value={end} onChange={setEnd} min={parseDmy(start)} />
        </View>
      </View>
      <Text style={styles.hint}>Shortening the dates keeps any day that still has something on it.</Text>
      {error && <Notice text={error} tone="danger" />}
      <Button title="Save" onPress={save} loading={busy} />
      <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, padding: spacing.md, gap: spacing.sm },
  heading: { fontWeight: '700', color: colors.accent, fontSize: 16 },
  hint: { color: colors.ink3, fontSize: 12 },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
