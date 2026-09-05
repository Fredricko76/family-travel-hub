import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, spacing } from '../theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        pressed && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.accent} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'secondary' && styles.buttonTextSecondary,
            variant === 'danger' && styles.buttonTextDanger,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.ink3}
        {...rest}
        style={[styles.input, props.multiline && styles.inputMultiline, rest.style]}
      />
    </View>
  );
}

export function Chip({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'accent' | 'done' | 'warn' | 'danger' }) {
  return (
    <View style={[styles.chip, chipTone[tone].bg]}>
      <Text style={[styles.chipText, chipTone[tone].fg]}>{text}</Text>
    </View>
  );
}

const chipTone = {
  neutral: { bg: { backgroundColor: colors.surface2 }, fg: { color: colors.ink2 } },
  accent: { bg: { backgroundColor: colors.accentSoft }, fg: { color: colors.accent } },
  done: { bg: { backgroundColor: colors.doneSoft }, fg: { color: colors.done } },
  warn: { bg: { backgroundColor: colors.sunSoft }, fg: { color: colors.sun } },
  danger: { bg: { backgroundColor: colors.dangerSoft }, fg: { color: colors.danger } },
};

export function Notice({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'danger' | 'accent' }) {
  return (
    <View style={[styles.notice, tone === 'danger' && styles.noticeDanger, tone === 'accent' && styles.noticeAccent]}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  buttonDanger: { backgroundColor: colors.dangerSoft },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  buttonTextSecondary: { color: colors.ink },
  buttonTextDanger: { color: colors.danger },
  field: { gap: spacing.xs },
  label: { fontSize: 13, color: colors.ink2, fontWeight: '600', letterSpacing: 0.3 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  chipText: { fontSize: 11, fontWeight: '700' },
  notice: {
    backgroundColor: colors.sunSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.sun,
    padding: spacing.md,
    borderRadius: 8,
  },
  noticeDanger: { backgroundColor: colors.dangerSoft, borderLeftColor: colors.danger },
  noticeAccent: { backgroundColor: colors.accentSoft, borderLeftColor: colors.accent },
  noticeText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
});
