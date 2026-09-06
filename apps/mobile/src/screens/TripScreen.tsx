import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Chip, Notice } from '../components/ui';
import { ReviewCard } from '../components/ReviewCard';
import { colors, spacing } from '../theme';
import type { ExtractedItem, Extraction, ItineraryDay, ItineraryItem, Trip, TripDocument } from '../types';
import { acceptItems, declineDocument, deleteItem, deleteTrip, extractDocument, pickAndUploadDocument } from '../lib/documents';
import { confirm } from '../lib/confirm';
import { ItemEditor } from '../components/ItemEditor';
import { buildItemRow, createItem, inferZone, updateItem, type ItemInput } from '../lib/items';
import { utcToLocalParts } from '../lib/time';
import { GalleryTab } from '../components/GalleryTab';
import { PeopleTab } from '../components/PeopleTab';
import { myRole } from '../lib/people';
import { isAdminRole, type TripRole } from '../types';

type Tab = 'plan' | 'gallery' | 'people';
import { formatDayHeading, formatTime, KIND_LABEL, shortZone, toDmy } from '../lib/format';
import { demoDays, demoDocuments, demoExtraction, demoItems } from '../demo';
import { errorMessage } from '../lib/errors';

type Props = { trip: Trip; onBack: () => void; demo?: boolean };

type Review = { document: TripDocument; extraction: Extraction };

const STATUS_LABEL: Record<TripDocument['status'], { text: string; tone: 'neutral' | 'accent' | 'done' | 'warn' | 'danger' }> = {
  uploading: { text: 'Uploading', tone: 'neutral' },
  queued: { text: 'Reading', tone: 'accent' },
  ready_for_review: { text: 'Needs review', tone: 'warn' },
  accepted: { text: 'Added', tone: 'done' },
  declined: { text: 'Discarded', tone: 'neutral' },
  failed: { text: 'Failed', tone: 'danger' },
};

export function TripScreen({ trip: initialTrip, onBack, demo = false }: Props) {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [notice, setNotice] = useState<string | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>(demo ? demoDays : []);
  const [items, setItems] = useState<ItineraryItem[]>(demo ? demoItems : []);
  const [documents, setDocuments] = useState<TripDocument[]>(demo ? demoDocuments : []);
  const [loading, setLoading] = useState(!demo);
  const [working, setWorking] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ dayId: string; item: ItineraryItem | null; initial: ItemInput } | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [tab, setTab] = useState<Tab>('plan');
  const [role, setRole] = useState<TripRole | null>(demo ? 'owner' : null);
  const [myUserId, setMyUserId] = useState<string | null>(demo ? 'demo-user' : null);
  const canEdit = isAdminRole(role);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    (async () => {
      try {
        const [r, auth] = await Promise.all([myRole(trip), supabase.auth.getUser()]);
        if (!cancelled) {
          setRole(r);
          setMyUserId(auth.data.user?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Could not check your role on this trip.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trip.id, demo]);

  const load = useCallback(async () => {
    if (demo) return;
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
  }, [trip.id, demo]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: any change to this trip's items or documents refreshes the screen.
  useEffect(() => {
    if (demo) return;
    const channel = supabase
      .channel(`trip-${trip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_items', filter: `trip_id=eq.${trip.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `trip_id=eq.${trip.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [trip.id, load, demo]);

  // In the sample-data preview every action stays on the device.
  function openDemoReview() {
    setReview({ document: demoDocuments[1], extraction: demoExtraction });
  }

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ItineraryItem[]>();
    for (const item of items) {
      const list = map.get(item.day_id) ?? [];
      list.push(item);
      map.set(item.day_id, list);
    }
    // Timed items in start order, untimed items after them in their manual order.
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.starts_at && b.starts_at) return a.starts_at.localeCompare(b.starts_at);
        if (a.starts_at) return -1;
        if (b.starts_at) return 1;
        return a.sort_order - b.sort_order;
      });
    }
    return map;
  }, [items]);

  async function uploadAndExtract() {
    if (working) return; // ignore a second tap while the first is in flight
    setError(null);
    setNotice(null);
    if (demo) {
      openDemoReview();
      return;
    }
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
      setError(errorMessage(err, 'Upload failed.'));
    } finally {
      setWorking(null);
      await load();
    }
  }

  async function retryExtraction(doc: TripDocument) {
    setError(null);
    if (demo) {
      openDemoReview();
      return;
    }
    setWorking('extract');
    try {
      const response = await extractDocument(doc.id);
      setReview({ document: doc, extraction: response.result });
    } catch (err) {
      setError(errorMessage(err, 'Extraction failed.'));
    } finally {
      setWorking(null);
      await load();
    }
  }

  async function reopenReview(doc: TripDocument) {
    setError(null);
    if (demo) {
      openDemoReview();
      return;
    }
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
    if (demo) {
      const added: ItineraryItem[] = chosen.map((item, index) => {
        const date = item.starts_local?.slice(0, 10);
        const target = days.find((d) => d.day_date === date) ?? days[0];
        return {
          id: `demo-added-${Date.now()}-${index}`,
          trip_id: trip.id,
          day_id: target.id,
          kind: item.kind,
          title: item.title,
          starts_at: item.starts_local ? new Date(item.starts_local).toISOString() : null,
          starts_tz: item.starts_tz,
          ends_at: item.ends_local ? new Date(item.ends_local).toISOString() : null,
          ends_tz: item.ends_tz,
          location: item.location,
          notes: item.notes,
          sort_order: 100 + index,
          document_id: review.document.id,
        };
      });
      setItems((prev) => [...prev, ...added]);
      setDocuments((prev) => prev.map((d) => (d.id === review.document.id ? { ...d, status: 'accepted' } : d)));
      setReview(null);
      return;
    }
    setWorking('accept');
    try {
      const result = await acceptItems(trip, review.document.id, chosen, days);
      setReview(null);
      if (result.extendedTo) {
        setTrip(result.trip);
        setNotice(
          `Trip dates widened to ${formatDayHeading(result.extendedTo.start)} to ${formatDayHeading(result.extendedTo.end)} so every booking has its own day.`,
        );
      } else if (result.clamped > 0) {
        setNotice(
          `${result.clamped} item${result.clamped === 1 ? ' falls' : 's fall'} outside the trip dates and ${result.clamped === 1 ? 'was' : 'were'} placed on the nearest day. Adjust the trip dates to spread them out.`,
        );
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not add items.'));
    } finally {
      setWorking(null);
      await load();
    }
  }

  function openAdd(day: ItineraryDay) {
    setError(null);
    setEditor({
      dayId: day.id,
      item: null,
      initial: { kind: 'activity', title: '', date: toDmy(day.day_date), time: '', tz: inferZone(day, days, items), location: '', notes: '' },
    });
  }

  function openEdit(item: ItineraryItem) {
    setError(null);
    const day = days.find((d) => d.id === item.day_id);
    const tz = item.starts_tz ?? inferZone(day ?? days[0], days, items);
    const parts = item.starts_at ? utcToLocalParts(item.starts_at, tz) : null;
    setEditor({
      dayId: item.day_id,
      item,
      initial: {
        kind: item.kind,
        title: item.title,
        date: toDmy(parts?.date ?? day?.day_date ?? trip.start_date),
        time: parts?.time ?? '',
        tz,
        location: item.location ?? '',
        notes: item.notes ?? '',
      },
    });
  }

  async function saveEditor(input: ItemInput) {
    if (!editor) return;
    setSavingItem(true);
    try {
      if (demo) {
        const row = buildItemRow(trip, days, input); // validates the form the same way
        const saved: ItineraryItem = {
          ...(editor.item ?? { id: `demo-item-${Date.now()}`, sort_order: 0, document_id: null, ends_at: null, ends_tz: null }),
          ...row,
        };
        setItems((prev) => (editor.item ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]));
      } else {
        const saved = editor.item
          ? await updateItem(trip, days, editor.item.id, input)
          : await createItem(trip, days, input);
        setItems((prev) => (editor.item ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]));
      }
      setEditor(null);
    } finally {
      setSavingItem(false);
    }
  }

  async function removeItem(item: ItineraryItem) {
    const ok = await confirm('Remove this item?', item.title, 'Remove');
    if (!ok) return;
    if (demo) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      return;
    }
    try {
      await deleteItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(errorMessage(err, 'Could not remove the item.'));
    }
  }

  async function removeTrip() {
    const ok = await confirm(
      'Delete this trip?',
      `"${trip.name}" and all of its itinerary, documents and photos will be deleted for everyone on it. This cannot be undone.`,
    );
    if (!ok) return;
    if (demo) {
      onBack();
      return;
    }
    setWorking('delete');
    try {
      await deleteTrip(trip);
      onBack();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the trip.'));
      setWorking(null);
    }
  }

  async function decline() {
    if (!review) return;
    if (demo) {
      setDocuments((prev) => prev.map((d) => (d.id === review.document.id ? { ...d, status: 'declined' } : d)));
      setReview(null);
      return;
    }
    setWorking('decline');
    try {
      await declineDocument(review.document.id);
      setReview(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not discard.'));
    } finally {
      setWorking(null);
      await load();
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.link}>{demo ? '‹ Back to sign in' : '‹ All trips'}</Text>
      </Pressable>
      {demo && <Notice text="Sample data. Nothing here is saved. Sign in to plan a real trip." tone="accent" />}
      <Text style={styles.eyebrow}>{trip.destination?.toUpperCase() ?? 'TRIP'}</Text>
      <Text style={styles.title}>{trip.name}</Text>
      <Text style={styles.meta}>
        {formatDayHeading(trip.start_date)} to {formatDayHeading(trip.end_date)} · {days.length} days
      </Text>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            ['plan', 'Plan'],
            ['gallery', 'Gallery'],
            ['people', 'People'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            style={[styles.tab, tab === key && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Notice text={error} tone="danger" />}
      {notice && <Notice text={notice} tone="accent" />}

      {tab === 'gallery' && <GalleryTab trip={trip} demo={demo} canEdit={canEdit} myUserId={myUserId} />}
      {tab === 'people' && <PeopleTab trip={trip} demo={demo} canEdit={canEdit} myUserId={myUserId} />}

      {tab === 'plan' && canEdit && (
        review ? (
          <ReviewCard
            fileName={review.document.original_name ?? 'Document'}
            extraction={review.extraction}
            busy={working === 'accept' || working === 'decline'}
            onAccept={accept}
            onDecline={decline}
          />
        ) : (
          <Button
            title={working === 'upload' ? 'Uploading…' : working === 'extract' ? 'Reading the document…' : 'Upload travel plans'}
            onPress={uploadAndExtract}
            loading={working === 'upload' || working === 'extract'}
          />
        )
      )}

      {tab === 'plan' && <Text style={styles.section}>Itinerary</Text>}
      {tab === 'plan' && days.map((day) => {
        const dayItems = itemsByDay.get(day.id) ?? [];
        return (
          <View key={day.id} style={styles.day}>
            <View style={styles.dayHead}>
              <Text style={styles.dayHeading}>{formatDayHeading(day.day_date)}</Text>
              {canEdit && (
                <Pressable onPress={() => openAdd(day)} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.link}>+ Add</Text>
                </Pressable>
              )}
            </View>
            {dayItems.length === 0 && editor?.dayId !== day.id ? (
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
                  {canEdit && (
                    <View style={styles.itemActions}>
                      <Pressable onPress={() => openEdit(item)} accessibilityRole="button" hitSlop={8}>
                        <Text style={styles.link}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => removeItem(item)} accessibilityRole="button" hitSlop={8}>
                        <Text style={styles.remove}>Remove</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
            {editor?.dayId === day.id && (
              <ItemEditor
                key={editor.item?.id ?? 'new'}
                title={editor.item ? 'Edit item' : `Add to ${formatDayHeading(day.day_date)}`}
                initial={editor.initial}
                saving={savingItem}
                onSave={saveEditor}
                onCancel={() => setEditor(null)}
              />
            )}
          </View>
        );
      })}

      {tab === 'plan' && canEdit && <Text style={styles.section}>Uploaded plans</Text>}
      {tab === 'plan' && canEdit && documents.length === 0 && <Text style={styles.dayEmpty}>No documents uploaded yet</Text>}
      {tab === 'plan' && canEdit && documents.map((doc) => {
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

      {tab === 'plan' && role === 'owner' && (
        <View style={styles.dangerZone}>
          <Button
            title="Delete this trip"
            variant="danger"
            onPress={removeTrip}
            loading={working === 'delete'}
            disabled={working !== null && working !== 'delete'}
          />
          <Text style={styles.dangerHint}>Everything in this trip goes too, for everyone on it.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: 64, paddingBottom: 64, gap: spacing.md },
  link: { color: colors.accent, fontWeight: '600' },
  eyebrow: { color: colors.accent, fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  title: { fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  meta: { color: colors.ink2 },
  section: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: spacing.lg },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, padding: 3, marginTop: spacing.xs },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabOn: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  tabText: { fontWeight: '600', color: colors.ink2 },
  tabTextOn: { color: colors.ink },
  day: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayHeading: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  itemActions: { alignItems: 'flex-end', gap: 6, paddingTop: 2 },
  dayEmpty: { color: colors.ink3, fontSize: 13 },
  item: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  itemTime: { width: 48, color: colors.ink2, fontVariant: ['tabular-nums'], fontSize: 13, paddingTop: 2 },
  itemTitle: { fontWeight: '600', color: colors.ink, fontSize: 15 },
  itemMeta: { color: colors.ink2, fontSize: 12 },
  itemNotes: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  docName: { color: colors.ink, fontWeight: '600' },
  docError: { color: colors.danger, fontSize: 12 },
  remove: { color: colors.ink3, fontSize: 12, paddingTop: 2 },
  dangerZone: { marginTop: spacing.xl, gap: spacing.sm },
  dangerHint: { color: colors.ink3, fontSize: 12, textAlign: 'center' },
});
