import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { placeImage, type PlacePhoto } from '../lib/placeImages';

type Props = { place: string | null; hint?: string | null; height?: number; caption?: string | null };

/** A photo of a place with its name over the bottom edge. Shows nothing if no photo is found. */
export function PlaceBanner({ place, hint, height = 150, caption }: Props) {
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

  if (!place || !photo || failed) return null;
  const uri = useSmall ? photo.small : photo.big;
  return (
    <View style={[styles.wrap, { height }]}>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        accessibilityLabel={place}
        onError={() => {
          // The big size can be missing for some photos; drop to the small one, then give up.
          if (!useSmall && photo.small !== photo.big) setUseSmall(true);
          else setFailed(true);
        }}
      />
      <View style={styles.shade} />
      <View style={styles.label}>
        <Text style={styles.place}>{place}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2 },
  image: { width: '100%', height: '100%' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', backgroundColor: 'rgba(0,0,0,0.45)' },
  label: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.sm },
  place: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  caption: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
});
