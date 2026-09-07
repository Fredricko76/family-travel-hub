import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Field, Notice } from '../components/ui';
import { AuthCard } from '../components/AuthCard';
import { colors, spacing } from '../theme';
import { errorMessage } from '../lib/errors';

type Props = { onPreview: () => void };

/**
 * Family members never see this: their sign-in link signs them in once and
 * the device stays signed in. This card is for admins setting up a device.
 */
export function SignInScreen({ onPreview }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'warn' | 'danger' | 'accent' } | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (err) {
      setMessage({ text: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

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
      <Notice text="Admin sign-in. Family members don't need this: their link opens the app directly." tone="accent" />
      <Field
        label="EMAIL"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry autoComplete="password" />
      {message && <Notice text={message.text} tone={message.tone} />}
      <Button title="Sign in" onPress={submit} loading={busy} disabled={!email.trim() || !password} />
      <Pressable
        onPress={() =>
          setMessage({
            text: 'Lost your link or password? Ask whoever runs the app to send you a new sign-in link.',
            tone: 'accent',
          })
        }
        accessibilityRole="button"
        hitSlop={8}
        style={styles.forgot}
      >
        <Text style={styles.forgotText}>Can't get in?</Text>
      </Pressable>
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  forgot: { alignItems: 'center', paddingTop: spacing.xs },
  forgotText: { color: colors.ink2, textDecorationLine: 'underline', fontSize: 15 },
  footerLink: { color: '#BDBDBD', textDecorationLine: 'underline', fontSize: 14 },
});
