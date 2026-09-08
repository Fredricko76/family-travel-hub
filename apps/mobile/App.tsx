import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { NeedLinkScreen } from './src/screens/NeedLinkScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { TripScreen } from './src/screens/TripScreen';
import { colors } from './src/theme';
import type { Trip } from './src/types';
import { demoTrip } from './src/demo';
import { LandingScreen } from './src/screens/LandingScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { formatDayHeading } from './src/lib/format';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [preview, setPreview] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [view, setView] = useState<'welcome' | 'plan' | 'tasks'>('welcome');
  const [landingDates, setLandingDates] = useState<string | null>(null);
  // The trip the welcome page is about; its task list opens from there too.
  const [landingTripId, setLandingTripId] = useState<string | null>(null);

  // Dates for the welcome page: the trip that's on now, else the next one coming up.
  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase.from('trips').select('id, name, start_date, end_date').order('start_date');
      const today = new Date().toISOString().slice(0, 10);
      const list = (data ?? []) as { id: string; name: string; start_date: string; end_date: string }[];
      const pick = list.find((t) => t.start_date <= today && t.end_date >= today) ?? list.find((t) => t.start_date > today) ?? list[list.length - 1];
      if (pick) {
        setLandingDates(`${formatDayHeading(pick.start_date)} to ${formatDayHeading(pick.end_date)}`);
        setLandingTripId(pick.id);
      }
    })();
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSession(data.session);
        return;
      }
      // No accounts: this device gets its own quiet identity so photos and
      // check-ins can be recorded, then the app opens straight away.
      const { data: anon, error } = await supabase.auth.signInAnonymously();
      if (error || !anon.session) {
        setOpenError(error?.message ?? 'Could not open the app.');
        setSession(null);
        return;
      }
      setSession(anon.session);
    });
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
  } else if (!session && preview) {
    screen = <TripScreen trip={demoTrip} demo onBack={() => setPreview(false)} />;
  } else if (!session) {
    screen = <NeedLinkScreen onPreview={() => setPreview(true)} error={openError} />;
  } else if (view === 'welcome') {
    screen = <LandingScreen dates={landingDates} onEnter={() => setView('plan')} onTasks={() => setView('tasks')} />;
  } else if (view === 'tasks') {
    screen = <TasksScreen tripId={landingTripId} onBack={() => setView('welcome')} />;
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
