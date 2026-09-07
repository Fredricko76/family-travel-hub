import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Field, Notice } from '../components/ui';
import { AuthCard } from '../components/AuthCard';
import { colors, spacing } from '../theme';
import { errorMessage } from '../lib/errors';

type Props = { onPreview: () => void };

export function SignInScreen({ onPreview }: Props) {
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
      setMessage({ text: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !!email.trim() && (mode === 'signup' ? password.length >= 6 : password.length > 0);

  return (
    <AuthCard
      title="Family Travel Hub"
      subtitle="Plans, photos and check-ins for the family"
      footer={
        <Pressable onPress={onPreview} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.footerLink}>Look around with sample data</Text>
        </Pressable>
      }
    >
      <View style={styles.switch} accessibilityRole="tablist">
        {(
          [
            ['signin', 'Sign in'],
            ['signup', 'Create account'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => {
              setMode(key);
              setMessage(null);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === key }}
            style={[styles.switchTab, mode === key && styles.switchTabOn]}
          >
            <Text style={[styles.switchText, mode === key && styles.switchTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'signup' && <Field label="YOUR NAME" value={name} onChangeText={setName} placeholder="Fred" autoCapitalize="words" />}
      <Field
        label="EMAIL"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Field
        label="PASSWORD"
        value={password}
        onChangeText={setPassword}
        placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
        secureTextEntry
        autoComplete={mode === 'signup' ? 'new-password' : 'password'}
      />
      {message && <Notice text={message.text} tone={message.tone} />}
      <Button title={mode === 'signin' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} disabled={!canSubmit} />
      {mode === 'signin' && (
        <Pressable
          onPress={() =>
            setMessage({
              text: 'Ask whoever set up the app to send you a new sign-in link. It lets you choose a fresh password.',
              tone: 'accent',
            })
          }
          accessibilityRole="button"
          hitSlop={8}
          style={styles.forgot}
        >
          <Text style={styles.forgotText}>Forgotten your password?</Text>
        </Pressable>
      )}
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 12, padding: 4 },
  switchTab: { flex: 1, paddingVertical: 12, borderRadius: 9, alignItems: 'center' },
  switchTabOn: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  switchText: { fontSize: 16, color: colors.ink2, fontWeight: '500' },
  switchTextOn: { color: colors.ink, fontWeight: '600' },
  forgot: { alignItems: 'center', paddingTop: spacing.xs },
  forgotText: { color: colors.ink2, textDecorationLine: 'underline', fontSize: 15 },
  footerLink: { color: '#BDBDBD', textDecorationLine: 'underline', fontSize: 14 },
});
