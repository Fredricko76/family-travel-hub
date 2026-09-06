import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { ExtractedItem, ExtractResponse, ItineraryDay, Trip, TripDocument } from '../types';

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

type PickedFile = {
  name: string;
  mime: string;
  size: number | null;
  bytes: () => Promise<Uint8Array>;
};

function extensionFor(name: string | undefined, mime: string | undefined) {
  const fromName = name?.includes('.') ? name.split('.').pop() : undefined;
  if (fromName) return fromName.toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/** Native: the system document picker, read back through expo-file-system. */
async function pickFileNative(): Promise<PickedFile | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ACCEPTED_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.length) return null;
  const asset = picked.assets[0];
  const file = new File(asset.uri);
  return {
    name: asset.name,
    mime: asset.mimeType ?? 'application/pdf',
    size: asset.size ?? null,
    bytes: () => file.bytes(),
  };
}

/**
 * Web: our own hidden <input type="file">. The library version dispatches a
 * synthetic click, which mobile Safari ignores; a real element.click() inside
 * the tap handler opens the chooser on every browser.
 */
function pickFileWeb(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED_TYPES.join(',');
    input.style.display = 'none';
    document.body.appendChild(input);
    const finish = (value: PickedFile | null) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const chosen = input.files?.[0];
      if (!chosen) return finish(null);
      finish({
        name: chosen.name,
        mime: chosen.type || 'application/pdf',
        size: chosen.size,
        bytes: async () => new Uint8Array(await chosen.arrayBuffer()),
      });
    });
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/**
 * Let the user pick a PDF or image, upload it under the trip, and record it.
 * Returns null if the picker was cancelled.
 */
export async function pickAndUploadDocument(trip: Trip): Promise<TripDocument | null> {
  const picked = Platform.OS === 'web' ? await pickFileWeb() : await pickFileNative();
  if (!picked) return null;

  const mime = picked.mime;
  if (!ACCEPTED_TYPES.includes(mime)) {
    throw new Error('Please choose a PDF, JPEG, PNG or WebP file.');
  }

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error('You are signed out.');

  // 1. Create the row first so the storage path can use its id.
  const { data: doc, error: insertError } = await supabase
    .from('documents')
    .insert({
      trip_id: trip.id,
      uploaded_by: userId,
      original_name: picked.name,
      mime_type: mime,
      size_bytes: picked.size,
      status: 'uploading',
    })
    .select()
    .single();
  if (insertError || !doc) throw insertError ?? new Error('Could not record the document.');

  // 2. Upload the bytes to the private bucket.
  const bytes = await picked.bytes();
  const storagePath = `${trip.id}/${doc.id}.${extensionFor(picked.name, mime)}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    await supabase
      .from('documents')
      .update({ status: 'failed', error_message: uploadError.message })
      .eq('id', doc.id);
    throw uploadError;
  }

  // 3. Point the row at the file.
  const { data: updated, error: updateError } = await supabase
    .from('documents')
    .update({ storage_path: storagePath, status: 'queued' })
    .eq('id', doc.id)
    .select()
    .single();
  if (updateError || !updated) throw updateError ?? new Error('Could not update the document.');
  return updated as TripDocument;
}

/** Ask the Edge Function to read the document with Claude. */
export async function extractDocument(documentId: string): Promise<ExtractResponse> {
  const { data, error } = await supabase.functions.invoke<ExtractResponse>('extract-document', {
    body: { document_id: documentId },
  });
  if (error) {
    // The function returns { error } with a non-2xx status; surface that text.
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.json();
        if (body?.error) throw new Error(body.error);
      } catch (inner) {
        if (inner instanceof Error && inner.message !== 'Unexpected end of JSON input') throw inner;
      }
    }
    throw error;
  }
  if (!data) throw new Error('Extraction returned nothing.');
  return data;
}

/** Local calendar date (YYYY-MM-DD) from an ISO string with offset. */
export function localDateOf(isoWithOffset: string | null): string | null {
  if (!isoWithOffset) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoWithOffset);
  return match ? match[1] : null;
}

/** Pick the itinerary day an item belongs to, clamping to the trip range. */
export function dayForItem(item: ExtractedItem, days: ItineraryDay[]): ItineraryDay | null {
  if (days.length === 0) return null;
  const date = localDateOf(item.starts_local);
  if (!date) return days[0];
  const exact = days.find((d) => d.day_date === date);
  if (exact) return exact;
  return date < days[0].day_date ? days[0] : days[days.length - 1];
}

/** Longest a trip may become through automatic extension, in days. */
const MAX_TRIP_DAYS = 120;

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export type AcceptResult = {
  trip: Trip;
  days: ItineraryDay[];
  /** Set when the trip's dates were widened to fit the new items. */
  extendedTo: { start: string; end: string } | null;
  /** Set when items fell outside the trip and were clamped to its first or last day. */
  clamped: number;
};

/**
 * Turn accepted extracted items into real itinerary items.
 * Each item is stored as an absolute instant plus the zone it should display in.
 * If items fall outside the trip's dates, the trip is widened to cover them
 * (up to MAX_TRIP_DAYS); otherwise they land on the nearest edge day.
 */
export async function acceptItems(
  trip: Trip,
  documentId: string,
  items: ExtractedItem[],
  days: ItineraryDay[],
): Promise<AcceptResult> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  let currentTrip = trip;
  let currentDays = days;
  let extendedTo: AcceptResult['extendedTo'] = null;

  const dates = items.map((i) => localDateOf(i.starts_local)).filter((d): d is string => d !== null);
  if (dates.length > 0) {
    const earliest = dates.reduce((a, b) => (a < b ? a : b));
    const latest = dates.reduce((a, b) => (a > b ? a : b));
    const newStart = earliest < trip.start_date ? earliest : trip.start_date;
    const newEnd = latest > trip.end_date ? latest : trip.end_date;
    const changes = newStart !== trip.start_date || newEnd !== trip.end_date;
    if (changes && daysBetween(newStart, newEnd) + 1 <= MAX_TRIP_DAYS) {
      const { data: updatedTrip, error: tripError } = await supabase
        .from('trips')
        .update({ start_date: newStart, end_date: newEnd })
        .eq('id', trip.id)
        .select()
        .single();
      if (tripError) throw tripError;
      currentTrip = updatedTrip as Trip;
      const { data: dayRows, error: dayError } = await supabase
        .from('itinerary_days')
        .select('*')
        .eq('trip_id', trip.id)
        .order('day_date');
      if (dayError) throw dayError;
      currentDays = dayRows as ItineraryDay[];
      extendedTo = { start: newStart, end: newEnd };
    }
  }

  let clamped = 0;
  const rows = items
    .map((item, index) => {
      const day = dayForItem(item, currentDays);
      if (!day) return null;
      const date = localDateOf(item.starts_local);
      if (date && date !== day.day_date) clamped += 1;
      const startsAt = item.starts_local && !Number.isNaN(Date.parse(item.starts_local))
        ? new Date(item.starts_local).toISOString()
        : null;
      const endsAt = item.ends_local && !Number.isNaN(Date.parse(item.ends_local))
        ? new Date(item.ends_local).toISOString()
        : null;
      const routeNote =
        item.from_iata && item.to_iata ? `${item.from_iata} → ${item.to_iata}` : null;
      return {
        trip_id: currentTrip.id,
        day_id: day.id,
        kind: item.kind,
        title: item.title,
        starts_at: startsAt,
        starts_tz: item.starts_tz,
        ends_at: endsAt,
        ends_tz: item.ends_tz,
        location: item.location ?? item.from_name ?? null,
        notes: [item.code, routeNote, item.notes].filter(Boolean).join(' · ') || null,
        sort_order: index,
        document_id: documentId,
        created_by: userId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length > 0) {
    const { error } = await supabase.from('itinerary_items').insert(rows);
    if (error) throw error;
  }
  const { error: statusError } = await supabase
    .from('documents')
    .update({ status: 'accepted' })
    .eq('id', documentId);
  if (statusError) throw statusError;

  return { trip: currentTrip, days: currentDays, extendedTo, clamped };
}

/** Remove one itinerary item. Editors only, enforced by row-level security. */
export async function deleteItem(itemId: string) {
  const { error } = await supabase.from('itinerary_items').delete().eq('id', itemId);
  if (error) throw error;
}

/**
 * Delete a whole trip: its files in storage first, then the row, which
 * cascades to days, items, documents and extractions. Owner only.
 */
export async function deleteTrip(trip: Trip) {
  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('trip_id', trip.id);
  if (docsError) throw docsError;
  const paths = (docs ?? []).map((d) => d.storage_path).filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from('documents').remove(paths);
    if (removeError) throw removeError;
  }
  const { error } = await supabase.from('trips').delete().eq('id', trip.id);
  if (error) throw error;
}

export async function declineDocument(documentId: string) {
  const { error } = await supabase.from('documents').update({ status: 'declined' }).eq('id', documentId);
  if (error) throw error;
}
