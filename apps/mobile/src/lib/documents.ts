import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { supabase } from './supabase';
import type { ExtractedItem, ExtractResponse, ItineraryDay, Trip, TripDocument } from '../types';

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function extensionFor(name: string | undefined, mime: string | undefined) {
  const fromName = name?.includes('.') ? name.split('.').pop() : undefined;
  if (fromName) return fromName.toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Let the user pick a PDF or image, upload it under the trip, and record it.
 * Returns null if the picker was cancelled.
 */
export async function pickAndUploadDocument(trip: Trip): Promise<TripDocument | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ACCEPTED_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.length) return null;

  const asset = picked.assets[0];
  const mime = asset.mimeType ?? 'application/pdf';
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
      original_name: asset.name,
      mime_type: mime,
      size_bytes: asset.size ?? null,
      status: 'uploading',
    })
    .select()
    .single();
  if (insertError || !doc) throw insertError ?? new Error('Could not record the document.');

  // 2. Upload the bytes to the private bucket.
  const file = new File(asset.uri);
  const bytes = await file.bytes();
  const storagePath = `${trip.id}/${doc.id}.${extensionFor(asset.name, mime)}`;
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

/**
 * Turn accepted extracted items into real itinerary items.
 * Each item is stored as an absolute instant plus the zone it should display in.
 */
export async function acceptItems(
  trip: Trip,
  documentId: string,
  items: ExtractedItem[],
  days: ItineraryDay[],
) {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  const rows = items
    .map((item, index) => {
      const day = dayForItem(item, days);
      if (!day) return null;
      const startsAt = item.starts_local && !Number.isNaN(Date.parse(item.starts_local))
        ? new Date(item.starts_local).toISOString()
        : null;
      const endsAt = item.ends_local && !Number.isNaN(Date.parse(item.ends_local))
        ? new Date(item.ends_local).toISOString()
        : null;
      const routeNote =
        item.from_iata && item.to_iata ? `${item.from_iata} → ${item.to_iata}` : null;
      return {
        trip_id: trip.id,
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
}

export async function declineDocument(documentId: string) {
  const { error } = await supabase.from('documents').update({ status: 'declined' }).eq('id', documentId);
  if (error) throw error;
}
