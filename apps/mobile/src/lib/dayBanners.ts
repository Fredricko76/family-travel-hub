import { supabase } from './supabase';
import type { ItineraryDay, Trip } from '../types';
import type { PickedPhoto } from './photos';

const URL_TTL_SECONDS = 60 * 60;
const BANNER_WIDTH = 1280;

function extensionFor(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  return 'jpg';
}

/** Put the family's own photo on a day. Replaces any earlier one. */
export async function setDayBanner(trip: Trip, day: ItineraryDay, picked: PickedPhoto): Promise<ItineraryDay> {
  // A fresh name each time, so a changed photo never shows the old cached one.
  const path = `${trip.id}/day-banners/${day.id}-${Date.now()}.${extensionFor(picked.mime)}`;
  const bytes = await picked.bytes();
  const { error: uploadError } = await supabase.storage.from('photos').upload(path, bytes, { contentType: picked.mime });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from('itinerary_days').update({ banner_path: path }).eq('id', day.id).select().single();
  if (error || !data) {
    await supabase.storage.from('photos').remove([path]);
    throw error ?? new Error('Could not save the photo.');
  }
  if (day.banner_path) await supabase.storage.from('photos').remove([day.banner_path]);
  urlCache.delete(day.banner_path ?? '');
  return data as ItineraryDay;
}

/** Take the photo off a day, leaving the plain box. */
export async function removeDayBanner(day: ItineraryDay): Promise<ItineraryDay> {
  const { data, error } = await supabase.from('itinerary_days').update({ banner_path: null }).eq('id', day.id).select().single();
  if (error || !data) throw error ?? new Error('Could not remove the photo.');
  if (day.banner_path) {
    await supabase.storage.from('photos').remove([day.banner_path]);
    urlCache.delete(day.banner_path);
  }
  return data as ItineraryDay;
}

const urlCache = new Map<string, { url: string; expires: number }>();

/** A viewable link for a day's photo, sized for the banner. Good for an hour. */
export async function dayBannerUrl(path: string): Promise<string | null> {
  const cached = urlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data } = await supabase.storage
    .from('photos')
    .createSignedUrl(path, URL_TTL_SECONDS, { transform: { width: BANNER_WIDTH, resize: 'contain' } });
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + (URL_TTL_SECONDS - 60) * 1000 });
  return data.signedUrl;
}
