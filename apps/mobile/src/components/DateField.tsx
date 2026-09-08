import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../theme';
import { parseDmy, toDmy } from '../lib/format';

type Props = {
  label: string;
  value: string; // as typed, day/month/year
  onChange: (dmy: string) => void;
  placeholder?: string;
  /** Optional range (YYYY-MM-DD). Days outside it are greyed out and can't be tapped. */
  min?: string | null;
  max?: string | null;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** A date box with a calendar button that drops the whole month down to pick from. */
export function DateField({ label, value, onChange, placeholder, min, max }: Props) {
  const [open, setOpen] = useState(false);
  const selected = parseDmy(value);
  const startFrom = selected ?? min ?? new Date().toISOString().slice(0, 10);
  const [cursor, setCursor] = useState(() => ({ y: Number(startFrom.slice(0, 4)), m: Number(startFrom.slice(5, 7)) - 1 }));

  const grid = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
    const offset = (first.getUTCDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
    const cells: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  function openCalendar() {
    const from = parseDmy(value) ?? min ?? new Date().toISOString().slice(0, 10);
    setCursor({ y: Number(from.slice(0, 4)), m: Number(from.slice(5, 7)) - 1 });
    setOpen((v) => !v);
  }

  function move(delta: number) {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? 'dd/mm/yyyy'}
          placeholderTextColor={colors.ink3}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          style={styles.input}
        />
        <Pressable onPress={openCalendar} accessibilityRole="button" accessibilityLabel="Pick a date" style={[styles.calButton, open && styles.calButtonOn]}>
          <Text style={[styles.calIcon, open && styles.calIconOn]}>▦</Text>
        </Pressable>
      </View>
      {open && (
        <View style={styles.calendar}>
          <View style={styles.monthRow}>
            <Pressable onPress={() => move(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} style={styles.nav}>
              <Text style={styles.navText}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>
              {MONTHS[cursor.m]} {cursor.y}
            </Text>
            <Pressable onPress={() => move(1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={8} style={styles.nav}>
              <Text style={styles.navText}>›</Text>
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekday}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {grid.map((d, i) => {
              if (d === null) return <View key={`e${i}`} style={styles.cell} />;
              const date = iso(cursor.y, cursor.m, d);
              const outside = (min && date < min) || (max && date > max);
              const isSelected = date === selected;
              const isToday = date === today;
              return (
                <Pressable
                  key={date}
                  disabled={!!outside}
                  onPress={() => {
                    onChange(toDmy(date));
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={date}
                  style={[styles.cell, isSelected && styles.cellOn, isToday && !isSelected && styles.cellToday]}
                >
                  <Text style={[styles.cellText, outside && styles.cellTextOff, isSelected && styles.cellTextOn]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: 13, color: colors.ink2, fontWeight: '600', letterSpacing: 0.3 },
  inputRow: { flexDirection: 'row', gap: spacing.xs },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  calButton: { width: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  calButtonOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  calIcon: { fontSize: 20, color: colors.accent },
  calIconOn: { color: '#fff' },
  calendar: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: spacing.sm, gap: 4 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 20, color: colors.ink, lineHeight: 22 },
  monthTitle: { fontWeight: '800', color: colors.accent, fontSize: 15 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, color: colors.ink3, fontWeight: '600', paddingVertical: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  cellOn: { backgroundColor: colors.done },
  cellToday: { borderWidth: 2, borderColor: colors.accent },
  cellText: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  cellTextOff: { color: colors.line },
  cellTextOn: { color: '#fff' },
});
