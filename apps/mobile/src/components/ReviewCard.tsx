import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Field, Notice } from './ui';
import { colors, spacing } from '../theme';
import type { ExtractedItem, Extraction } from '../types';
import { formatTime, KIND_LABEL, shortZone } from '../lib/format';
import { localDateOf } from '../lib/documents';

type Props = {
  fileName: string;
  extraction: Extraction;
  busy: boolean;
  onAccept: (items: ExtractedItem[]) => void;
  onDecline: () => void;
};

/**
 * The review step. Nothing reaches the itinerary until the user taps Add.
 * Each proposed item can be toggled off or have its title and notes edited.
 */
export function ReviewCard({ fileName, extraction, busy, onAccept, onDecline }: Props) {
  const [items, setItems] = useState<ExtractedItem[]>(extraction.items);
  const [selected, setSelected] = useState<boolean[]>(extraction.items.map(() => true));
  const [editing, setEditing] = useState<number | null>(null);

  const chosen = items.filter((_, i) => selected[i]);
  const confidencePct = Math.round(extraction.confidence * 100);
  const confidenceTone = extraction.confidence >= 0.85 ? 'done' : extraction.confidence >= 0.6 ? 'warn' : 'danger';

  function update(index: number, patch: Partial<ExtractedItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>REVIEW EXTRACTION</Text>
          <Text style={styles.title}>
            {extraction.provider ?? KIND_LABEL[extraction.document_type] ?? 'Document'}
            {extraction.booking_reference ? ` · ${extraction.booking_reference}` : ''}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>{fileName}</Text>
        </View>
        <Chip text={`${confidencePct}% sure`} tone={confidenceTone} />
      </View>

      {extraction.warnings.map((w, i) => (
        <Notice key={i} text={w} tone="warn" />
      ))}

      {items.length === 0 && <Text style={styles.empty}>No bookings were found in this file.</Text>}

      {items.map((item, i) => {
        const date = localDateOf(item.starts_local);
        const isEditing = editing === i;
        return (
          <View key={i} style={[styles.item, !selected[i] && styles.itemOff]}>
            <Pressable
              onPress={() => setSelected((prev) => prev.map((s, j) => (j === i ? !s : s)))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected[i] }}
              style={[styles.check, selected[i] && styles.checkOn]}
            >
              {selected[i] && <Text style={styles.checkMark}>✓</Text>}
            </Pressable>
            <View style={styles.flex}>
              <View style={styles.itemHead}>
                <Chip text={KIND_LABEL[item.kind] ?? item.kind} tone="accent" />
                {date && (
                  <Text style={styles.when}>
                    {date}
                    {item.starts_local ? ` · ${formatTime(item.starts_local, item.starts_tz)}` : ''}
                    {item.starts_tz ? ` ${shortZone(item.starts_tz)}` : ''}
                    {item.ends_local ? ` → ${formatTime(item.ends_local, item.ends_tz)}` : ''}
                    {item.ends_tz && item.ends_tz !== item.starts_tz ? ` ${shortZone(item.ends_tz)}` : ''}
                  </Text>
                )}
              </View>
              {isEditing ? (
                <View style={styles.editor}>
                  <Field label="Title" value={item.title} onChangeText={(t) => update(i, { title: t })} />
                  <Field label="Notes" value={item.notes ?? ''} onChangeText={(t) => update(i, { notes: t || null })} multiline />
                  <Button title="Done" variant="secondary" onPress={() => setEditing(null)} />
                </View>
              ) : (
                <Pressable onPress={() => setEditing(i)} accessibilityRole="button">
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {(item.from_iata || item.location) && (
                    <Text style={styles.itemMeta}>
                      {item.from_iata && item.to_iata ? `${item.from_iata} → ${item.to_iata}` : item.location}
                    </Text>
                  )}
                  {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
                  <Text style={styles.edit}>Tap to edit</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}

      <View style={styles.actions}>
        <Button
          title={chosen.length === 0 ? 'Nothing to add' : `Add ${chosen.length} to itinerary`}
          onPress={() => onAccept(chosen)}
          loading={busy}
          disabled={chosen.length === 0}
        />
        <Button title="Discard" variant="secondary" onPress={onDecline} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
  eyebrow: { color: colors.accent, fontWeight: '700', letterSpacing: 2, fontSize: 11 },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink },
  meta: { color: colors.ink3, fontSize: 12 },
  empty: { color: colors.ink2 },
  item: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  itemOff: { opacity: 0.45 },
  check: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#fff', fontWeight: '800' },
  itemHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  when: { color: colors.ink2, fontSize: 12, fontVariant: ['tabular-nums'] },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  itemMeta: { color: colors.ink2, fontSize: 13 },
  itemNotes: { color: colors.ink3, fontSize: 13, marginTop: 2 },
  edit: { color: colors.accent, fontSize: 12, marginTop: 4 },
  editor: { gap: spacing.sm },
  actions: { gap: spacing.sm, paddingTop: spacing.sm },
});
