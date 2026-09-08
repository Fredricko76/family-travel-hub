import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { landing } from '../landing';

type Props = { dates: string | null; onEnter: () => void };

/** Native fallback for the welcome page; the web build uses LandingScreen.web.tsx. */
export function LandingScreen({ dates, onEnter }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.family}>{landing.family.toUpperCase()}</Text>
      <Text style={styles.headline}>{landing.headline}</Text>
      <Text style={styles.destination}>{landing.destination}</Text>
      {dates ? <Text style={styles.dates}>{dates}</Text> : null}
      <Text style={styles.tagline}>{landing.tagline}</Text>
      <Pressable onPress={onEnter} accessibilityRole="button" style={styles.button}>
        <Text style={styles.buttonText}>{landing.enter}</Text>
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
  tagline: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', maxWidth: 320 },
  button: { marginTop: 24, backgroundColor: '#FFE08A', borderRadius: 999, paddingVertical: 18, paddingHorizontal: 30 },
  buttonText: { color: '#0B1F4D', fontWeight: '700', fontSize: 18 },
});
