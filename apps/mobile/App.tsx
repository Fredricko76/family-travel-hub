import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { SignInScreen } from './src/screens/SignInScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { TripScreen } from './src/screens/TripScreen';
import { colors } from './src/theme';
import type { Trip } from './src/types';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [trip, setTrip] = useState<Trip | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setTrip(null);
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
  } else if (!session) {
    screen = <SignInScreen />;
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
