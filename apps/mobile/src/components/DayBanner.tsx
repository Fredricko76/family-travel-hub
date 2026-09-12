import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import type { ItineraryDay, Trip } from '../types';
import { pickPhoto } from '../lib/photos';
import { dayBannerUrl, removeDayBanner, setDayBanner } from '../lib/dayBanners';
import { confirm } from '../lib/confirm';
import { errorMessage } from '../lib/errors';

type Props = {
  trip: Trip;
  day: ItineraryDay;
  title: string | null;
  caption: string;
  canEdit: boolean;
  demo?: boolean;
  onChanged: (day: ItineraryDay) => void;
  onError: (message: string) => void;
};

/**
 * The box under the date strip: the family's own photo for the day, or a
 * plain box until one is added. Anyone with the link can add or change it.
 */
export function DayBanner({ trip, day, title, caption, canEdit, demo, onChanged, onError }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!day.banner_path || demo) return;
    dayBannerUrl(day.banner_path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [day.banner_path, demo]);

  async function choose() {
    if (busy) return;
    if (demo) {
      onError('Sample data: photos are not saved.');
      return;
    }
    try {
      const picked = await pickPhoto('library');
      if (!picked) return;
      setBusy(true);
      onChanged(await setDayBanner(trip, day, picked));
    } catch (err) {
      onError(errorMessage(err, 'Could not add the photo.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    const ok = await confirm('Remove this photo?', 'The day goes back to a plain box. You can add another photo any time.', 'Remove');
    if (!ok) return;
    setBusy(true);
    try {
      onChanged(await removeDayBanner(day));
    } catch (err) {
      onError(errorMessage(err, 'Could not remove the photo.'));
    } finally {
      setBusy(false);
    }
  }

  const hasPhoto = !!day.banner_path;

  return (
    <View style={styles.wrap}>
      {hasPhoto && url ? <Image source={{ uri: url }} style={styles.image} resizeMode="cover" accessibilityLabel={title ?? caption} /> : <View style={styles.blank} />}
      {hasPhoto && <View style={styles.shade} />}
      <View style={styles.label}>
        {title ? <Text style={[styles.place, !hasPhoto && styles.placeOnBlank]}>{title}</Text> : null}
        <Text style={[styles.caption, !hasPhoto && styles.captionOnBlank]}>{caption}</Text>
      </View>
      {canEdit && (
        <View style={styles.actions}>
          {busy ? (
            <ActivityIndicator color={hasPhoto ? '#fff' : colors.accent} />
          ) : (
            <>
              <Pressable onPress={choose} accessibilityRole="button" hitSlop={6} style={[styles.action, !hasPhoto && styles.actionOnBlank]}>
                <Text style={[styles.actionText, !hasPhoto && styles.actionTextOnBlank]}>{hasPhoto ? 'Change photo' : 'Add a photo'}</Text>
              </Pressable>
              {hasPhoto && (
                <Pressable onPress={remove} accessibilityRole="button" hitSlop={6} style={styles.action}>
                  <Text style={styles.actionText}>Remove</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2 },
  image: { width: '100%', height: '100%' },
  blank: { flex: 1, backgroundColor: colors.accentSoft },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', backgroundColor: 'rgba(0,0,0,0.45)' },
  label: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.sm },
  place: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  placeOnBlank: { color: colors.accent, textShadowRadius: 0 },
  caption: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  captionOnBlank: { color: colors.done },
  actions: { position: 'absolute', top: spacing.sm, right: spacing.sm, flexDirection: 'row', gap: 6, alignItems: 'center' },
  action: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)' },
  actionOnBlank: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  actionTextOnBlank: { color: colors.accent },
});
