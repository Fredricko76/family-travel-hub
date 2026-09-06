import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Notice } from './ui';
import { colors, spacing } from '../theme';
import type { ItemKind } from '../types';
import type { ItemInput } from '../lib/items';
import { KIND_LABEL } from '../lib/format';

const KINDS: ItemKind[] = ['activity', 'meal', 'stay', 'flight', 'transport', 'note'];

type Props = {
  initial: ItemInput;
  title: string;
  saving: boolean;
  onSave: (input: ItemInput) => Promise<void> | void;
  onCancel: () => void;
};

/** Inline form for adding or editing one itinerary item. */
export function ItemEditor({ initial, title, saving, onSave, onCancel }: Props) {
  const [form, setForm] = useState<ItemInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ItemInput>) => setForm((prev) => ({ ...prev, ...patch }));

  async function save() {
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{title}</Text>

      <View style={styles.kinds}>
        {KINDS.map((k) => (
          <Pressable
            key={k}
            onPress={() => set({ kind: k })}
            accessibilityRole="radio"
            accessibilityState={{ selected: form.kind === k }}
            style={[styles.kind, form.kind === k && styles.kindOn]}
          >
            <Text style={[styles.kindText, form.kind === k && styles.kindTextOn]}>{KIND_LABEL[k]}</Text>
          </Pressable>
        ))}
      </View>

      <Field label="What" value={form.title} onChangeText={(t) => set({ title: t })} placeholder="Lunch at Locavore" autoFocus />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Day (day/month/year)" value={form.date} onChangeText={(t) => set({ date: t })} placeholder="14/10/2026" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={styles.flex}>
          <Field label="Time (24h, optional)" value={form.time} onChangeText={(t) => set({ time: t })} placeholder="12:30" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <Field label="Time zone" value={form.tz} onChangeText={(t) => set({ tz: t })} autoCapitalize="none" autoCorrect={false} placeholder="Asia/Makassar" />
      <Field label="Where (optional)" value={form.location} onChangeText={(t) => set({ location: t })} placeholder="Ubud centre" />
      <Field label="Notes (optional)" value={form.notes} onChangeText={(t) => set({ notes: t })} placeholder="Booking ref, pickup point, what to bring" multiline />

      {error && <Notice text={error} tone="danger" />}

      <View style={styles.actions}>
        <Button title="Save" onPress={save} loading={saving} disabled={!form.title.trim()} />
        <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heading: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kind: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.surface2 },
  kindOn: { backgroundColor: colors.accent },
  kindText: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
  kindTextOn: { color: '#fff' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  actions: { gap: spacing.sm, paddingTop: spacing.xs },
});
