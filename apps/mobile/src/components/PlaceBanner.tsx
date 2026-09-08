import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { placeImage, type PlacePhoto } from '../lib/placeImages';

type Half = { place: string | null; hint?: string | null; caption?: string | null };

type Props = Half & {
  height?: number;
  /** A second photo shown beside the first, e.g. the ship next to the port. */
  second?: Half;
};

function Photo({ place, hint, caption, big }: Half & { big: boolean }) {
  const [photo, setPhoto] = useState<PlacePhoto | null>(null);
  const [useSmall, setUseSmall] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhoto(null);
    setUseSmall(false);
    setFailed(false);
    if (!place) return;
    placeImage(place, hint).then((p) => {
      if (!cancelled) setPhoto(p);
    });
    return () => {
      cancelled = true;
    };
  }, [place, hint]);

  return (
    <View style={styles.half}>
      {photo && !failed ? (
        <Image
          source={{ uri: useSmall || !big ? photo.small : photo.big }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={place ?? ''}
          onError={() => {
            if (!useSmall && photo.small !== photo.big) setUseSmall(true);
            else setFailed(true);
          }}
        />
      ) : (
        <View style={[styles.image, styles.blank]} />
      )}
      <View style={styles.shade} />
      <View style={styles.label}>
        {place ? <Text style={styles.place}>{place}</Text> : null}
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

/** A photo of a place with its name over the bottom edge; optionally two side by side. */
export function PlaceBanner({ place, hint, caption, height = 150, second }: Props) {
  if (!place && !second?.place) return null;
  return (
    <View style={[styles.wrap, { height }]}>
      <Photo place={place} hint={hint} caption={caption} big={!second} />
      {second && (
        <>
          <View style={styles.divider} />
          <Photo place={second.place} hint={second.hint} caption={second.caption} big={false} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2, flexDirection: 'row' },
  half: { flex: 1 },
  divider: { width: 3, backgroundColor: colors.surface },
  image: { width: '100%', height: '100%' },
  blank: { backgroundColor: colors.accentSoft },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', backgroundColor: 'rgba(0,0,0,0.45)' },
  label: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.sm },
  place: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  caption: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
});
