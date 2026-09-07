import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY. Copy apps/mobile/.env.example to apps/mobile/.env and fill it in.',
  );
}

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On the web, invite and password-reset links land here with a session in the URL.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'implicit',
  },
});

/**
 * True when the page was opened from an invite or password-reset link, so the
 * person should choose a password before going any further. Web only.
 */
export function arrivedFromSignInLink(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const hash = window.location.hash;
  return /type=(invite|recovery|magiclink)/.test(hash);
}

// Keep the session fresh while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
