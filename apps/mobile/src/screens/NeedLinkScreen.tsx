import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AuthCard } from '../components/AuthCard';
import { Notice } from '../components/ui';

type Props = { onPreview: () => void; error: string | null };

/**
 * Only shown if the app could not open on its own (for example, anonymous
 * access switched off in Supabase). Normally visitors never see this.
 */
export function NeedLinkScreen({ onPreview, error }: Props) {
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
      <Notice
        text={
          error
            ? `The app could not open: ${error}. Try again in a moment, or tell whoever runs the app.`
            : 'Opening the app…'
        }
        tone={error ? 'danger' : 'accent'}
      />
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  footerLink: { color: '#BDBDBD', textDecorationLine: 'underline', fontSize: 14 },
});
