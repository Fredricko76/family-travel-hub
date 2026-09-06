import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Notice } from './ui';
import { colors, spacing } from '../theme';
import type { Trip } from '../types';
import { deletePhoto, fullPhotoUrl, listPhotos, pickPhoto, uploadPhoto, type PhotoWithUrl } from '../lib/photos';
import { confirm } from '../lib/confirm';
import { errorMessage } from '../lib/errors';
import { formatDayHeading } from '../lib/format';

type Props = { trip: Trip; demo: boolean; canEdit: boolean; myUserId: string | null };

function localDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function GalleryTab({ trip, demo, canEdit, myUserId }: Props) {
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ photo: PhotoWithUrl; url: string } | null>(null);
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 720) - spacing.lg * 2 - 8) / 3);

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    try {
      setPhotos(await listPhotos(trip));
    } catch (err) {
      setError(errorMessage(err, 'Could not load photos.'));
    } finally {
      setLoading(false);
    }
  }, [trip, demo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (demo) return;
    const channel = supabase
      .channel(`photos-${trip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos', filter: `trip_id=eq.${trip.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [trip.id, demo, load]);

  const groups = useMemo(() => {
    const map = new Map<string, PhotoWithUrl[]>();
    for (const p of photos) {
      const key = localDate(p.taken_at);
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [photos]);

  async function add(source: 'camera' | 'library') {
    if (busy) return;
    setError(null);
    if (demo) {
      setError('Sign in to add photos to a real trip.');
      return;
    }
    setBusy(source);
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      setBusy('upload');
      await uploadPhoto(trip, picked);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not add the photo.'));
    } finally {
      setBusy(null);
    }
  }

  async function open(photo: PhotoWithUrl) {
    const url = (await fullPhotoUrl(photo)) ?? photo.thumbUrl;
    if (url) setViewing({ photo, url });
  }

  async function remove(photo: PhotoWithUrl) {
    const ok = await confirm('Delete this photo?', 'It will be removed for everyone on the trip.');
    if (!ok) return;
    try {
      await deletePhoto(photo);
      setViewing(null);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the photo.'));
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button title="Take a photo" onPress={() => add('camera')} loading={busy === 'camera'} disabled={busy !== null && busy !== 'camera'} />
        </View>
        <View style={styles.flex}>
          <Button title="Choose from library" variant="secondary" onPress={() => add('library')} loading={busy === 'library'} disabled={busy !== null && busy !== 'library'} />
        </View>
      </View>
      {busy === 'upload' && <Notice text="Uploading photo…" tone="accent" />}
      {error && <Notice text={error} tone="danger" />}

      {demo && (
        <Text style={styles.empty}>Photos taken by anyone on the trip appear here, grouped by day. Sign in to try it.</Text>
      )}
      {!demo && !loading && photos.length === 0 && (
        <Text style={styles.empty}>No photos yet. Take one or choose from your library.</Text>
      )}

      {groups.map(([date, list]) => (
        <View key={date} style={styles.group}>
          <Text style={styles.dayHeading}>{formatDayHeading(date)}</Text>
          <View style={styles.grid}>
            {list.map((p) => (
              <Pressable key={p.id} onPress={() => open(p)} accessibilityRole="imagebutton" accessibilityLabel="Open photo">
                {p.thumbUrl ? (
                  <Image source={{ uri: p.thumbUrl }} style={{ width: tile, height: tile, borderRadius: 8, backgroundColor: colors.surface2 }} />
                ) : (
                  <View style={{ width: tile, height: tile, borderRadius: 8, backgroundColor: colors.surface2 }} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewing(null)} accessibilityRole="button" accessibilityLabel="Close" />
          {viewing && (
            <View style={styles.viewerBody} pointerEvents="box-none">
              <Image source={{ uri: viewing.url }} style={styles.viewerImage} resizeMode="contain" />
              <View style={styles.viewerBar}>
                <Text style={styles.viewerText}>{formatDayHeading(localDate(viewing.photo.taken_at))}</Text>
                {(canEdit || viewing.photo.uploaded_by === myUserId) && (
                  <Pressable onPress={() => remove(viewing.photo)} accessibilityRole="button">
                    <Text style={styles.viewerDelete}>Delete</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setViewing(null)} accessibilityRole="button">
                  <Text style={styles.viewerClose}>Close</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  empty: { color: colors.ink3, fontSize: 14 },
  group: { gap: spacing.sm },
  dayHeading: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  viewerBody: { flex: 1, justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, gap: spacing.lg },
  viewerText: { color: '#fff', flex: 1 },
  viewerDelete: { color: '#FF8A80', fontWeight: '600' },
  viewerClose: { color: '#fff', fontWeight: '600' },
});
