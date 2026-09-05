import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Chip, Notice } from '../components/ui';
import { ReviewCard } from '../components/ReviewCard';
import { colors, spacing } from '../theme';
import type { ExtractedItem, Extraction, ItineraryDay, ItineraryItem, Trip, TripDocument } from '../types';
import { acceptItems, declineDocument, extractDocument, pickAndUploadDocument } from '../lib/documents';
import { formatDayHeading, formatTime, KIND_LABEL, shortZone } from '../lib/format';

type Props = { trip: Trip; onBack: () => void };

type Review = { document: TripDocument; extraction: Extraction };

const STATUS_LABEL: Record<TripDocument['status'], { text: string; tone: 'neutral' | 'accent' | 'done' | 'warn' | 'danger' }> = {
  uploading: { text: 'Uploading', tone: 'neutral' },
  queued: { text: 'Reading', tone: 'accent' },
  ready_for_review: { text: 'Needs review', tone: 'warn' },
  accepted: { text: 'Added', tone: 'done' },
  declined: { text: 'Discarded', tone: 'neutral' },
  failed: { text: 'Failed', tone: 'danger' },
};

export function TripScreen({ trip, onBack }: Props) {
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [documents, setDocuments] = useState<TripDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [daysRes, itemsRes, docsRes] = await Promise.all([
      supabase.from('itinerary_days').select('*').eq('trip_id', trip.id).order('day_date'),
      supabase.from('itinerary_items').select('*').eq('trip_id', trip.id).order('starts_at', { nullsFirst: false }).order('sort_order'),
      supabase.from('documents').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false }),
    ]);
    const firstError = daysRes.error ?? itemsRes.error ?? docsRes.error;
    if (firstError) setError(firstError.message);
    setDays((daysRes.data ?? []) as ItineraryDay[]);
    setItems((itemsRes.data ?? []) as ItineraryItem[]);
    setDocuments((docsRes.data ?? []) as TripDocument[]);
    setLoading(false);
  }, [trip.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: any change to this trip's items or documents refreshes the screen.
  useEffect(() => {
    const channel = supabase
      .channel(`trip-${trip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_items', filter: `trip_id=eq.${trip.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `trip_id=eq.${trip.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [trip.id, load]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ItineraryItem[]>();
    for (const item of items) {
      const list = map.get(item.day_id) ?? [];
      list.push(item);
      map.set(item.day_id, list);
    }
    return map;
  }, [items]);

  async function uploadAndExtract() {
    setError(null);
    setWorking('upload');
    let doc: TripDocument | null = null;
    try {
      doc = await pickAndUploadDocument(trip);
      if (!doc) return;
      setWorking('extract');
      await load();
      const response = await extractDocument(doc.id);
      setReview({ document: doc, extraction: response.result });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setWorking(null);
      await load();
    }
  }

  async function retryExtraction(doc: TripDocument) {
    setError(null);
    setWorking('extract');
    try {
      const response = await extractDocument(doc.id);
      setReview({ document: doc, extraction: response.result });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed.');
    } finally {
      setWorking(null);
      await load();
    }
  }

  async function reopenReview(doc: TripDocument) {
    setError(null);
    const { data, error: loadError } = await supabase
      .from('extractions')
      .select('result, warnings')
      .eq('document_id', doc.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (loadError || !data) {
      setError(loadError?.message ?? 'No extraction found for this document.');
      return;
    }
    const result = data.result as Extraction;
    setReview({ document: doc, extraction: { ...result, warnings: (data.warnings as string[]) ?? result.warnings } });
  }

  async function accept(chosen: ExtractedItem[]) {
    if (!review) return;
    setWorking('accept');
    try {
      await acceptItems(trip, review.document.id, chosen, days);
      setReview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add items.');
    } finally {
      setWorking(null);
      await load();
    }
  }

  async function decline() {
    if (!review) return;
    setWorking('decline');
    try {
      await declineDocument(review.document.id);
      setReview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not discard.');
    } finally {
      setWorking(null);
      await load();
    }
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.link}>‹ All trips</Text>
      </Pressable>
      <Text style={styles.eyebrow}>{trip.destination?.toUpperCase() ?? 'TRIP'}</Text>
      <Text style={styles.title}>{trip.name}</Text>
      <Text style={styles.meta}>
        {formatDayHeading(trip.start_date)} to {formatDayHeading(trip.end_date)} · {days.length} days
      </Text>

      {error && <Notice text={error} tone="danger" />}

      {review ? (
        <ReviewCard
          fileName={review.document.original_name ?? 'Document'}
          extraction={review.extraction}
          busy={working === 'accept' || working === 'decline'}
          onAccept={accept}
          onDecline={decline}
        />
      ) : (
        <Button
          title={working === 'upload' ? 'Uploading…' : working === 'extract' ? 'Reading the document…' : 'Upload a booking'}
          onPress={uploadAndExtract}
          loading={working === 'upload' || working === 'extract'}
        />
      )}

      <Text style={styles.section}>Itinerary</Text>
      {days.map((day) => {
        const dayItems = itemsByDay.get(day.id) ?? [];
        return (
          <View key={day.id} style={styles.day}>
            <Text style={styles.dayHeading}>{formatDayHeading(day.day_date)}</Text>
            {dayItems.length === 0 ? (
              <Text style={styles.dayEmpty}>Nothing planned yet</Text>
            ) : (
              dayItems.map((item) => (
                <View key={item.id} style={styles.item}>
                  <Text style={styles.itemTime}>
                    {item.starts_at ? formatTime(item.starts_at, item.starts_tz) : '—'}
                  </Text>
                  <View style={styles.flex}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemMeta}>
                      {KIND_LABEL[item.kind]}
                      {item.starts_tz ? ` · ${shortZone(item.starts_tz)} time` : ''}
                      {item.location ? ` · ${item.location}` : ''}
                    </Text>
                    {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
                  </View>
                </View>
              ))
            )}
          </View>
        );
      })}

      <Text style={styles.section}>Documents</Text>
      {documents.length === 0 && <Text style={styles.dayEmpty}>No documents uploaded yet</Text>}
      {documents.map((doc) => {
        const status = STATUS_LABEL[doc.status];
        return (
          <View key={doc.id} style={styles.doc}>
            <View style={styles.flex}>
              <Text style={styles.docName} numberOfLines={1}>{doc.original_name ?? 'Document'}</Text>
              {doc.error_message ? <Text style={styles.docError}>{doc.error_message}</Text> : null}
            </View>
            <Chip text={status.text} tone={status.tone} />
            {doc.status === 'ready_for_review' && !review && (
              <Pressable onPress={() => reopenReview(doc)} accessibilityRole="button">
                <Text style={styles.link}>Review</Text>
              </Pressable>
            )}
            {(doc.status === 'failed' || doc.status === 'queued') && !review && working === null && (
              <Pressable onPress={() => retryExtraction(doc)} accessibilityRole="button">
                <Text style={styles.link}>Retry</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: 64, paddingBottom: 64, gap: spacing.md },
  link: { color: colors.accent, fontWeight: '600' },
  eyebrow: { color: colors.accent, fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  title: { fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  meta: { color: colors.ink2 },
  section: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: spacing.lg },
  day: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  dayHeading: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  dayEmpty: { color: colors.ink3, fontSize: 13 },
  item: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  itemTime: { width: 48, color: colors.ink2, fontVariant: ['tabular-nums'], fontSize: 13, paddingTop: 2 },
  itemTitle: { fontWeight: '600', color: colors.ink, fontSize: 15 },
  itemMeta: { color: colors.ink2, fontSize: 12 },
  itemNotes: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  docName: { color: colors.ink, fontWeight: '600' },
  docError: { color: colors.danger, fontSize: 12 },
});
