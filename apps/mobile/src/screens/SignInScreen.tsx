import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Field, Notice } from '../components/ui';
import { colors, spacing } from '../theme';

export function SignInScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'warn' | 'danger' | 'accent' } | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() || undefined } },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage({ text: 'Check your email to confirm your account, then sign in.', tone: 'accent' });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Something went wrong.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>FAMILY TRAVEL HUB</Text>
        <Text style={styles.title}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.lede}>Upload the bookings once. Everyone on the trip sees the plan.</Text>

        <View style={styles.form}>
          {mode === 'signup' && (
            <Field label="Your name" value={name} onChangeText={setName} placeholder="Fred" autoCapitalize="words" />
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'password'}
          />
          {message && <Notice text={message.text} tone={message.tone} />}
          <Button
            title={mode === 'signin' ? 'Sign in' : 'Create account'}
            onPress={submit}
            loading={busy}
            disabled={!email || password.length < 8}
          />
          <Button
            title={mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            variant="secondary"
            onPress={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setMessage(null);
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, paddingTop: 80, gap: spacing.sm },
  eyebrow: { color: colors.accent, fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  title: { fontSize: 32, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  lede: { fontSize: 16, color: colors.ink2, marginBottom: spacing.lg },
  form: { gap: spacing.md },
});
