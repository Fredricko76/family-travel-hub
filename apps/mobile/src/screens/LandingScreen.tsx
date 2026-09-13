import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { landing } from '../landing';
import { plural, useCountdown } from '../lib/countdown';

type Props = { dates: string | null; takeOff: { at: Date; label: string } | null; onEnter: () => void; onTasks: () => void };

/** Native fallback for the welcome page; the web build uses LandingScreen.web.tsx. */
export function LandingScreen({ dates, takeOff, onEnter, onTasks }: Props) {
  const left = useCountdown(takeOff?.at ?? null);
  return (
    <View style={styles.root}>
      <Text style={styles.family}>{landing.family.toUpperCase()}</Text>
      <Text style={styles.headline}>{landing.headline}</Text>
      <Text style={styles.destination}>{landing.destination}</Text>
      {dates ? <Text style={styles.dates}>{dates}</Text> : null}
      {left && takeOff ? (
        left.passed ? (
          <Text style={styles.countLabel}>We're off!</Text>
        ) : (
          <View style={styles.count}>
            <Text style={styles.countLabel}>{takeOff.label.toUpperCase()}</Text>
            <View style={styles.tiles}>
              {[
                [left.months, plural(left.months, 'month')],
                [left.weeks, plural(left.weeks, 'week')],
                [left.days, plural(left.days, 'day')],
                [left.hours, plural(left.hours, 'hour')],
                [left.minutes, plural(left.minutes, 'minute')],
              ].map(([n, unit]) => (
                <View key={String(unit)} style={styles.tile}>
                  <Text style={styles.tileNumber}>{n}</Text>
                  <Text style={styles.tileUnit}>{unit}</Text>
                </View>
              ))}
            </View>
          </View>
        )
      ) : null}
      <Text style={styles.tagline}>{landing.tagline}</Text>
      <Pressable onPress={onEnter} accessibilityRole="button" style={styles.button}>
        <Text style={styles.buttonText}>{landing.enter}</Text>
      </Pressable>
      <Pressable onPress={onTasks} accessibilityRole="button" style={styles.buttonSecondary}>
        <Text style={styles.buttonSecondaryText}>{landing.tasks}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1F4D', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  family: { color: '#FFE08A', letterSpacing: 6, fontWeight: '600', fontSize: 16 },
  headline: { color: '#fff', fontSize: 44, fontWeight: '800', textAlign: 'center' },
  destination: { color: '#FFE08A', fontSize: 96, fontWeight: '900', letterSpacing: 6 },
  dates: { color: '#fff', fontSize: 18, fontWeight: '600' },
  count: { alignItems: 'center', gap: 8, marginTop: 8, width: '100%', maxWidth: 380 },
  countLabel: { color: '#FFE08A', fontSize: 13, letterSpacing: 3, fontWeight: '700' },
  tiles: { flexDirection: 'row', gap: 4, width: '100%' },
  tile: { flex: 1, paddingVertical: 8, paddingHorizontal: 2, borderRadius: 12, backgroundColor: 'rgba(11,31,77,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center' },
  tileNumber: { color: '#fff', fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileUnit: { color: 'rgba(255,255,255,0.85)', fontSize: 10, marginTop: 4, fontWeight: '600' },
  tagline: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', maxWidth: 320 },
  button: { marginTop: 24, backgroundColor: '#FFE08A', borderRadius: 999, paddingVertical: 18, paddingHorizontal: 30 },
  buttonText: { color: '#0B1F4D', fontWeight: '700', fontSize: 18 },
  buttonSecondary: { marginTop: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 999, paddingVertical: 15, paddingHorizontal: 28 },
  buttonSecondaryText: { color: '#fff', fontWeight: '700', fontSize: 17 },
});
