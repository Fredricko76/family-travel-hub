import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { arrivedFromSignInLink, supabase } from './src/lib/supabase';
import { SignInScreen } from './src/screens/SignInScreen';
import { NeedLinkScreen } from './src/screens/NeedLinkScreen';
import { Platform } from 'react-native';

/** The admin sign-in card is only reachable by adding ?admin to the address. */
function adminDoorRequested(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true; // native builds keep the card
  return /[?&]admin(=|&|$)/.test(window.location.search);
}
import { TripsScreen } from './src/screens/TripsScreen';
import { TripScreen } from './src/screens/TripScreen';
import { colors } from './src/theme';
import type { Trip } from './src/types';
import { demoTrip } from './src/demo';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [preview, setPreview] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session || adminDoorRequested()) {
        setSession(data.session);
        return;
      }
      // No account needed: this device gets its own quiet identity so photos
      // and check-ins can be recorded, then the app opens straight away.
      const { data: anon, error } = await supabase.auth.signInAnonymously();
      if (error || !anon.session) {
        setGuestError(error?.message ?? 'Could not open the app.');
        setSession(null);
        return;
      }
      setSession(anon.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setTrip(null);
      // Arrived through a sign-in link: the session is stored on this device,
      // so drop the token from the address bar and carry on. No password needed.
      if (next && arrivedFromSignInLink() && typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  let screen: React.ReactNode;
  if (session === undefined) {
    screen = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (!session && preview) {
    screen = <TripScreen trip={demoTrip} demo onBack={() => setPreview(false)} />;
  } else if (!session) {
    screen = adminDoorRequested() ? (
      <SignInScreen onPreview={() => setPreview(true)} />
    ) : (
      <NeedLinkScreen onPreview={() => setPreview(true)} error={guestError} />
    );
  } else if (trip) {
    screen = <TripScreen trip={trip} onBack={() => setTrip(null)} />;
  } else {
    screen = <TripsScreen onOpenTrip={setTrip} />;
  }

  return (
    <View style={styles.root}>
      {screen}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
