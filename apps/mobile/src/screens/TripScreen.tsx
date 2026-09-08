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
import { PlaceBanner } from '../components/PlaceBanner';
import { describeLeg, geocodeMissing, legBetween, type Leg } from '../lib/geo';
import type { CheckIn } from '../types';
import { checkIn, listCheckIns, progressOf, todayInTrip, undoCheckIn, upNext } from '../lib/checkins';
import { deviceZone } from '../lib/time';
import { demoCheckIns } from '../demo';

type Tab = 'plan' | 'gallery';
import { describeTimes, formatDayHeading, formatTime, KIND_LABEL, toDmy } from '../lib/format';
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
  const [checkIns, setCheckIns] = useState<CheckIn[]>(demo ? demoCheckIns : []);
  const [loading, setLoading] = useState(!demo);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const stripRef = React.useRef<ScrollView>(null);
  const dayX = React.useRef<Map<string, number>>(new Map());
  const [working, setWorking] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ dayId: string; item: ItineraryItem | null; initial: ItemInput } | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [tab, setTab] = useState<Tab>('plan');
  const [myUserId, setMyUserId] = useState<string | null>(demo ? 'demo-user' : null);
  const canEdit = true; // no roles: everyone on the trip can edit

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await supabase.auth.getUser();
        if (!cancelled) setMyUserId(auth.data.user?.id ?? null);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Could not check who you are.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trip.id, demo]);

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    const [daysRes, itemsRes, docsRes, checkInsRes] = await Promise.all([
      supabase.from('itinerary_days').select('*').eq('trip_id', trip.id).order('day_date'),
      supabase.from('itinerary_items').select('*').eq('trip_id', trip.id).order('starts_at', { nullsFirst: false }).order('sort_order'),
      supabase.from('documents').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false }),
      listCheckIns(trip).then((rows) => ({ data: rows, error: null }), (err) => ({ data: [] as CheckIn[], error: err as Error })),
    ]);
    const firstError = daysRes.error ?? itemsRes.error ?? docsRes.error ?? checkInsRes.error;
    if (firstError) setError(errorMessage(firstError));
    setDays((daysRes.data ?? []) as ItineraryDay[]);
    setItems((itemsRes.data ?? []) as ItineraryItem[]);
    setDocuments((docsRes.data ?? []) as TripDocument[]);
    setCheckIns(checkInsRes.data);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins', filter: `trip_id=eq.${trip.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [trip.id, load, demo]);

  // Find where each item is (once), so distances between neighbours can be shown.
  const geocoding = React.useRef(false);
  useEffect(() => {
    if (demo || geocoding.current) return;
    const pending = items.filter((i) => i.lat == null && i.geocode_query == null && i.kind !== 'flight' && (i.location || i.city));
    if (pending.length === 0) return;
    geocoding.current = true;
    geocodeMissing(pending)
      .then((changed) => {
        if (changed.length === 0) return;
        const byId = new Map(changed.map((c) => [c.id, c]));
        setItems((prev) => prev.map((i) => byId.get(i.id) ?? i));
      })
      .finally(() => {
        geocoding.current = false;
      });
  }, [items, demo]);

  // Today, in the zone the trip is currently in, and what is coming up next.
  const todayDate = useMemo(() => todayInTrip(days, items, deviceZone()), [days, items]);
  const todayDay = useMemo(() => days.find((d) => d.day_date === todayDate) ?? null, [days, todayDate]);
  const nextItem = useMemo(() => upNext(items, checkIns, todayDay?.id ?? null), [items, checkIns, todayDay]);
  const checkInByItem = useMemo(() => {
    const map = new Map<string, CheckIn>();
    for (const c of checkIns) if (!map.has(c.item_id)) map.set(c.item_id, c);
    return map;
  }, [checkIns]);
  const tripProgress = useMemo(() => progressOf(items, checkIns), [items, checkIns]);

  // The day on screen: whichever was tapped, else today while the trip is on, else the first day.
  const selectedDay = useMemo(
    () => days.find((d) => d.id === selectedDayId) ?? todayDay ?? days[0] ?? null,
    [days, selectedDayId, todayDay],
  );
  const selectedIndex = selectedDay ? days.findIndex((d) => d.id === selectedDay.id) : -1;
  function goDay(delta: number) {
    const next = days[selectedIndex + delta];
    if (next) {
      setSelectedDayId(next.id);
      setEditor(null);
    }
  }

  // Road distance and time between each item on the day and the next one.
  const [legs, setLegs] = useState<Map<string, Leg | null>>(new Map());
  useEffect(() => {
    const dayItems = selectedDay ? (itemsByDay.get(selectedDay.id) ?? []) : [];
    let cancelled = false;
    (async () => {
      for (let i = 1; i < dayItems.length; i += 1) {
        const a = dayItems[i - 1];
        const b = dayItems[i];
        const key = `${a.id}>${b.id}`;
        if (legs.has(key)) continue;
        if (a.kind === 'flight' || b.kind === 'flight' || a.lat == null || a.lng == null || b.lat == null || b.lng == null) continue;
        const leg = await legBetween({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
        if (cancelled) return;
        setLegs((prev) => new Map(prev).set(key, leg));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay?.id, items]);

  // Keep the selected day visible in the date strip.
  useEffect(() => {
    if (!selectedDay) return;
    const x = dayX.current.get(selectedDay.id);
    if (x === undefined) return;
    const t = setTimeout(() => stripRef.current?.scrollTo({ x: Math.max(0, x - 130), animated: true }), 50);
    return () => clearTimeout(t);
  }, [selectedDay, days.length]);

  async function toggleCheckIn(item: ItineraryItem) {
    setError(null);
    const existing = checkInByItem.get(item.id);
    if (demo) {
      setCheckIns((prev) =>
        existing
          ? prev.filter((c) => c.id !== existing.id)
          : [
              ...prev,
              {
                id: `demo-check-${Date.now()}`,
                trip_id: trip.id,
                item_id: item.id,
                user_id: 'demo-user',
                status: 'done',
                checked_at: new Date().toISOString(),
                note: null,
                profiles: { display_name: 'You' },
              },
            ],
      );
      return;
    }
    try {
      if (existing && (existing.user_id === myUserId || canEdit)) {
        await undoCheckIn(existing.id);
        setCheckIns((prev) => prev.filter((c) => c.id !== existing.id));
      } else if (!existing) {
        const created = await checkIn(trip, item);
        setCheckIns((prev) => [...prev, created]);
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not update the check-in.'));
    }
  }

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
    // Timed items in start order, then items with a date but no time (stored as
    // midnight), then untimed ones, each group in manual order.
    const key = (i: ItineraryItem): string | null => {
      if (!i.starts_at) return null;
      try {
        return utcToLocalParts(i.starts_at, i.starts_tz ?? 'UTC').time === '00:00' ? null : i.starts_at;
      } catch {
        return i.starts_at;
      }
    };
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        if (ka && kb) return ka.localeCompare(kb);
        if (ka) return -1;
        if (kb) return 1;
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
          city: item.city ?? null,
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
      initial: { kind: 'activity', title: '', date: toDmy(day.day_date), time: '', tz: inferZone(day, days, items), endDate: '', endTime: '', endTz: '', location: '', notes: '' },
    });
  }

  function openEdit(item: ItineraryItem) {
    setError(null);
    const day = days.find((d) => d.id === item.day_id);
    const tz = item.starts_tz ?? inferZone(day ?? days[0], days, items);
    const parts = item.starts_at ? utcToLocalParts(item.starts_at, tz) : null;
    const endTz = item.ends_tz ?? tz;
    const endParts = item.ends_at ? utcToLocalParts(item.ends_at, endTz) : null;
    setEditor({
      dayId: item.day_id,
      item,
      initial: {
        kind: item.kind,
        title: item.title,
        date: toDmy(parts?.date ?? day?.day_date ?? trip.start_date),
        time: parts?.time ?? '',
        tz,
        endDate: endParts && endParts.date !== parts?.date ? toDmy(endParts.date) : '',
        endTime: endParts?.time ?? '',
        endTz: item.ends_tz && item.ends_tz !== tz ? item.ends_tz : '',
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
          ...(editor.item ?? { id: `demo-item-${Date.now()}`, sort_order: 0, document_id: null, ends_at: null, ends_tz: null, city: null }),
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

  const dayCard = selectedDay
    ? (() => {
        const day = selectedDay;
        const dayItems = itemsByDay.get(day.id) ?? [];
        const isToday = day.id === todayDay?.id;
        const progress = progressOf(dayItems, checkIns);
        return (
          <View style={styles.day}>
            <View style={styles.dayNav}>
              <Pressable onPress={() => goDay(-1)} disabled={selectedIndex <= 0} accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={8} style={[styles.navButton, selectedIndex <= 0 && styles.navButtonOff]}>
                <Text style={styles.navText}>‹</Text>
              </Pressable>
              <View style={styles.dayHeadCentre}>
                <Text style={styles.dayHeading}>{formatDayHeading(day.day_date)}</Text>
                <View style={styles.dayHeadRow}>
                  {day.headline ? <Text style={styles.dayPlace}>{day.headline}</Text> : null}
                  {isToday && <Chip text="Today" tone="accent" />}
                </View>
              </View>
              <Pressable onPress={() => goDay(1)} disabled={selectedIndex >= days.length - 1} accessibilityRole="button" accessibilityLabel="Next day" hitSlop={8} style={[styles.navButton, selectedIndex >= days.length - 1 && styles.navButtonOff]}>
                <Text style={styles.navText}>›</Text>
              </Pressable>
            </View>
            <PlaceBanner place={day.headline} hint={trip.destination} caption={formatDayHeading(day.day_date)} />
            {progress.total > 0 && (
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round((progress.done / progress.total) * 100)}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {progress.done} of {progress.total} done
                </Text>
              </View>
            )}
            {dayItems.length === 0 && editor?.dayId !== day.id ? (
              <Text style={styles.dayEmpty}>Nothing planned for this day</Text>
            ) : (
              dayItems.map((item, index) => {
                const done = checkInByItem.get(item.id) ?? null;
                const isNext = nextItem?.id === item.id;
                const prev = index > 0 ? dayItems[index - 1] : null;
                const leg = prev ? legs.get(`${prev.id}>${item.id}`) ?? null : null;
                return (
                  <React.Fragment key={item.id}>
                  {leg && (
                    <View style={styles.leg}>
                      <Text style={styles.legText}>↓ {describeLeg(leg)}</Text>
                    </View>
                  )}
                  <View style={styles.item}>
                    <Pressable
                      onPress={() => toggleCheckIn(item)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!done }}
                      accessibilityLabel={done ? 'Mark as not done' : 'Check in'}
                      hitSlop={8}
                      style={[styles.check, done && styles.checkOn]}
                    >
                      {done && <Text style={styles.checkMark}>✓</Text>}
                    </Pressable>
                    <Text style={[styles.itemTime, done && styles.textDone]}>
                      {item.starts_at ? formatTime(item.starts_at, item.starts_tz) : '—'}
                    </Text>
                    <View style={styles.flex}>
                      <View style={styles.itemTitleRow}>
                        <Text style={[styles.itemTitle, done && styles.textDone]}>{item.title}</Text>
                        {isNext && !done && <Chip text="Up next" tone="accent" />}
                      </View>
                      {describeTimes(item, day.day_date) ? (
                        <Text style={styles.itemTimes}>{describeTimes(item, day.day_date)}</Text>
                      ) : null}
                      <Text style={styles.itemMeta}>
                        {KIND_LABEL[item.kind]}
                        {item.location ? ` · ${item.location}` : ''}
                      </Text>
                      {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
                      {done && (
                        <Text style={styles.doneLine}>
                          Done {formatTime(done.checked_at, item.starts_tz)}
                          {done.profiles?.display_name ? ` · ${done.profiles.display_name}` : ''}
                        </Text>
                      )}
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
                  </React.Fragment>
                );
              })
            )}
            {editor?.dayId === day.id ? (
              <ItemEditor
                key={editor.item?.id ?? 'new'}
                title={editor.item ? 'Edit item' : `Add to ${formatDayHeading(day.day_date)}`}
                initial={editor.initial}
                saving={savingItem}
                onSave={saveEditor}
                onCancel={() => setEditor(null)}
              />
            ) : (
              canEdit && <Button title="Add to this day" variant="secondary" onPress={() => openAdd(day)} />
            )}
          </View>
        );
      })()
    : null;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View style={styles.topRow}>
          <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>{demo ? '‹ Back to sign in' : '‹ All trips'}</Text>
          </Pressable>
          {tripProgress.total > 0 && (
            <Text style={styles.topProgress}>
              {tripProgress.done} of {tripProgress.total} done
            </Text>
          )}
        </View>
        {demo && <Notice text="Sample data. Nothing here is saved. Sign in to plan a real trip." tone="accent" />}
        <Text style={styles.title}>{trip.name}</Text>
        <Text style={styles.meta}>
          {trip.destination ? `${trip.destination} · ` : ''}
          {toDmy(trip.start_date)} to {toDmy(trip.end_date)} · {days.length} days
        </Text>

        {error && <Notice text={error} tone="danger" />}
        {notice && <Notice text={notice} tone="accent" />}

        {tab === 'gallery' && <GalleryTab trip={trip} demo={demo} canEdit={canEdit} myUserId={myUserId} />}

        {tab === 'plan' && (
          <>
            {nextItem && (
              <Pressable style={styles.nextCard} onPress={() => setSelectedDayId(nextItem.day_id)} accessibilityRole="button">
                <Text style={styles.nextLabel}>UP NEXT</Text>
                <Text style={styles.nextTitle}>{nextItem.title}</Text>
                <Text style={styles.nextMeta}>
                  {describeTimes(nextItem, days.find((d) => d.id === nextItem.day_id)?.day_date ?? todayDate) || 'Today, no set time'}
                  {nextItem.location ? ` · ${nextItem.location}` : ''}
                </Text>
              </Pressable>
            )}

            {canEdit && !demo && items.length === 0 && !review && (
              <Notice
                text="Start by uploading your itinerary or a booking. The dates and the place for each day fill in from what it finds."
                tone="accent"
              />
            )}

            {canEdit &&
              (review ? (
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
              ))}

            {days.length > 0 && (
              <ScrollView
                ref={stripRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.strip}
                style={styles.stripWrap}
              >
                {days.map((day) => {
                  const selected = day.id === selectedDay?.id;
                  const isToday = day.id === todayDay?.id;
                  const has = (itemsByDay.get(day.id)?.length ?? 0) > 0;
                  const [, m, d] = day.day_date.split('-');
                  const weekday = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day.day_date}T00:00:00Z`));
                  return (
                    <Pressable
                      key={day.id}
                      onPress={() => setSelectedDayId(day.id)}
                      onLayout={(e) => dayX.current.set(day.id, e.nativeEvent.layout.x)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      accessibilityLabel={formatDayHeading(day.day_date)}
                      style={[styles.dayChip, selected && styles.dayChipOn, isToday && !selected && styles.dayChipToday]}
                    >
                      <Text style={[styles.dayChipWeekday, selected && styles.dayChipTextOn]}>{weekday}</Text>
                      <Text style={[styles.dayChipNumber, selected && styles.dayChipTextOn]}>{Number(d)}</Text>
                      <Text style={[styles.dayChipMonth, selected && styles.dayChipTextOn]}>
                        {new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: 'UTC' }).format(new Date(`${day.day_date}T00:00:00Z`))}
                      </Text>
                      <View style={[styles.dayChipDot, has && (selected ? styles.dayChipDotOn : styles.dayChipDotHas)]} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {dayCard}

            {canEdit && (
              <View style={styles.docsSection}>
                <Text style={styles.section}>Uploaded plans</Text>
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
              </View>
            )}

            {(
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
          </>
        )}
      </ScrollView>

      <View style={styles.tabBar} accessibilityRole="tablist">
        {(
          [
            ['plan', 'Plan'],
            ['gallery', 'Gallery'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            style={styles.tab}
          >
            <View style={[styles.tabDot, tab === key && styles.tabDotOn]} />
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topProgress: { color: colors.ink2, fontSize: 13, fontVariant: ['tabular-nums'] },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    paddingBottom: 22,
    paddingHorizontal: spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  tabDotOn: { backgroundColor: colors.ink },
  tabText: { fontWeight: '600', color: colors.ink3, fontSize: 13 },
  tabTextOn: { color: colors.ink },
  stripWrap: { marginHorizontal: -spacing.lg },
  strip: { paddingHorizontal: spacing.lg, gap: 6 },
  dayChip: { width: 54, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 1 },
  dayChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayChipToday: { borderColor: colors.ink, borderWidth: 2 },
  dayChipWeekday: { fontSize: 11, color: colors.ink3, fontWeight: '600' },
  dayChipNumber: { fontSize: 18, color: colors.ink, fontWeight: '700' },
  dayChipMonth: { fontSize: 10, color: colors.ink3 },
  dayChipTextOn: { color: '#fff' },
  dayChipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent', marginTop: 2 },
  dayChipDotHas: { backgroundColor: colors.ink3 },
  dayChipDotOn: { backgroundColor: '#fff' },
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  navButtonOff: { opacity: 0.3 },
  navText: { fontSize: 22, color: colors.ink, lineHeight: 24, marginTop: -2 },
  dayHeadCentre: { flex: 1, alignItems: 'center', gap: 2 },
  dayHeadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  docsSection: { gap: spacing.sm, marginTop: spacing.md },
  day: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  dayHeadRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayToday: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.surface },
  dayPast: { opacity: 0.75 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.done },
  progressText: { color: colors.ink2, fontSize: 12, fontVariant: ['tabular-nums'] },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkOn: { backgroundColor: colors.done, borderColor: colors.done },
  checkMark: { color: '#fff', fontWeight: '800', fontSize: 14, lineHeight: 16 },
  itemDone: {},
  textDone: { color: colors.ink3, textDecorationLine: 'line-through' },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  doneLine: { color: colors.done, fontSize: 12, marginTop: 2, fontWeight: '600' },
  nextCard: { backgroundColor: colors.accentSoft, borderRadius: 12, padding: spacing.md, gap: 2 },
  nextLabel: { color: colors.accent, fontWeight: '700', letterSpacing: 2, fontSize: 11 },
  nextTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  nextMeta: { color: colors.ink2, fontSize: 13 },
  dayHeading: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  dayPlace: { fontWeight: '600', color: colors.accent },
  itemActions: { alignItems: 'flex-end', gap: 6, paddingTop: 2 },
  dayEmpty: { color: colors.ink3, fontSize: 13 },
  item: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  itemTime: { width: 48, color: colors.ink2, fontVariant: ['tabular-nums'], fontSize: 13, paddingTop: 2 },
  itemTitle: { fontWeight: '600', color: colors.ink, fontSize: 15 },
  itemMeta: { color: colors.ink2, fontSize: 12 },
  itemTimes: { color: colors.ink, fontSize: 13, fontWeight: '600', marginTop: 2 },
  leg: { paddingLeft: 32, paddingTop: 6 },
  legText: { color: colors.ink3, fontSize: 12, fontStyle: 'italic' },
  itemNotes: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  docName: { color: colors.ink, fontWeight: '600' },
  docError: { color: colors.danger, fontSize: 12 },
  remove: { color: colors.ink3, fontSize: 12, paddingTop: 2 },
  dangerZone: { marginTop: spacing.xl, gap: spacing.sm },
  dangerHint: { color: colors.ink3, fontSize: 12, textAlign: 'center' },
});
