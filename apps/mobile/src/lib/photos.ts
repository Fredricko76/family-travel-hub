import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { Photo, Trip } from '../types';

export type PickedPhoto = {
  mime: string;
  width: number | null;
  height: number | null;
  takenAt: Date;
  bytes: () => Promise<Uint8Array>;
};

const THUMB_WIDTH = 480;
const URL_TTL_SECONDS = 60 * 60;

/** "2026:10:14 09:12:33" from EXIF -> Date in the device's zone. */
function parseExifDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function pickNative(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access was not allowed. You can change that in Settings.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85, exif: true };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const exif = asset.exif as Record<string, unknown> | null | undefined;
  const takenAt = parseExifDate(exif?.DateTimeOriginal) ?? parseExifDate(exif?.DateTime) ?? new Date();
  const file = new File(asset.uri);
  return {
    mime: asset.mimeType ?? 'image/jpeg',
    width: asset.width ?? null,
    height: asset.height ?? null,
    takenAt,
    bytes: () => file.bytes(),
  };
}

/** Web: a real <input type="file">; `capture` asks phones to open the camera. */
function pickWeb(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    const finish = (v: PickedPhoto | null) => {
      input.remove();
      resolve(v);
    };
    input.addEventListener('change', () => {
      const chosen = input.files?.[0];
      if (!chosen) return finish(null);
      finish({
        mime: chosen.type || 'image/jpeg',
        width: null,
        height: null,
        takenAt: new Date(chosen.lastModified || Date.now()),
        bytes: async () => new Uint8Array(await chosen.arrayBuffer()),
      });
    });
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

export function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  return Platform.OS === 'web' ? pickWeb(source) : pickNative(source);
}

function extensionFor(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  return 'jpg';
}

export async function uploadPhoto(trip: Trip, picked: PickedPhoto): Promise<Photo> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error('You are signed out.');

  const { data: row, error: insertError } = await supabase
    .from('photos')
    .insert({
      trip_id: trip.id,
      uploaded_by: userId,
      storage_path: 'pending',
      taken_at: picked.takenAt.toISOString(),
      width: picked.width,
      height: picked.height,
    })
    .select()
    .single();
  if (insertError || !row) throw insertError ?? new Error('Could not record the photo.');

  const path = `${trip.id}/${row.id}.${extensionFor(picked.mime)}`;
  const bytes = await picked.bytes();
  const { error: uploadError } = await supabase.storage.from('photos').upload(path, bytes, { contentType: picked.mime });
  if (uploadError) {
    await supabase.from('photos').delete().eq('id', row.id);
    throw uploadError;
  }
  const { data: updated, error: updateError } = await supabase
    .from('photos')
    .update({ storage_path: path })
    .eq('id', row.id)
    .select()
    .single();
  if (updateError || !updated) throw updateError ?? new Error('Could not finish the upload.');
  return updated as Photo;
}

export type PhotoWithUrl = Photo & { thumbUrl: string | null };

export async function listPhotos(trip: Trip): Promise<PhotoWithUrl[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('trip_id', trip.id)
    .neq('storage_path', 'pending')
    .order('taken_at', { ascending: false });
  if (error) throw error;
  const photos = (data ?? []) as Photo[];
  const withUrls = await Promise.all(
    photos.map(async (p) => {
      const { data: signed } = await supabase.storage
        .from('photos')
        .createSignedUrl(p.storage_path, URL_TTL_SECONDS, { transform: { width: THUMB_WIDTH, resize: 'contain' } });
      return { ...p, thumbUrl: signed?.signedUrl ?? null };
    }),
  );
  return withUrls;
}

export async function fullPhotoUrl(photo: Photo): Promise<string | null> {
  const { data } = await supabase.storage.from('photos').createSignedUrl(photo.storage_path, URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

export async function deletePhoto(photo: Photo) {
  await supabase.storage.from('photos').remove([photo.storage_path]);
  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) throw error;
}
