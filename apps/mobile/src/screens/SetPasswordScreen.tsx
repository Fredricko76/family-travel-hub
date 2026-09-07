import React, { useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Field, Notice } from '../components/ui';
import { AuthCard } from '../components/AuthCard';
import { errorMessage } from '../lib/errors';

type Props = { email: string | null; onDone: () => void };

/** Shown once to someone arriving from an invite or password-reset link. */
export function SetPasswordScreen({ email, onDone }: Props) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (password.length < 6) {
      setError('Choose at least 6 characters.');
      return;
    }
    if (password !== again) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
      onDone();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Choose a password" subtitle={email ? `You're signed in as ${email}` : 'Pick a password to use from now on'}>
      <Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry autoComplete="new-password" autoFocus />
      <Field label="PASSWORD AGAIN" value={again} onChangeText={setAgain} placeholder="Type it once more" secureTextEntry autoComplete="new-password" />
      {error && <Notice text={error} tone="danger" />}
      <Button title="Save and continue" onPress={save} loading={busy} disabled={!password || !again} />
    </AuthCard>
  );
}
