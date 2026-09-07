import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

type Props = { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode };

/** Dark backdrop with a centred white card, shared by the sign-in and password screens. */
export function AuthCard({ title, subtitle, children, footer }: Props) {
  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.logoBox} accessibilityLabel="Family Travel Hub">
            <Text style={styles.logoMark}>FTH</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.body}>{children}</View>
        </View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#161616' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, paddingVertical: 40 },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.xl,
    paddingTop: 28,
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoMark: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.ink2, textAlign: 'center' },
  body: { width: '100%', gap: spacing.md, marginTop: spacing.md },
  footer: { marginTop: spacing.lg, alignItems: 'center' },
});
