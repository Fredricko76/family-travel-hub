import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, Notice } from '../components/ui';
import { colors, spacing } from '../theme';
import type { Task } from '../types';
import { addTask, deleteTask, listTasks, setTaskDone } from '../lib/tasks';
import { errorMessage } from '../lib/errors';
import { landing } from '../landing';

type Props = {
  /** Which trip's list to show. Null when no trip exists yet. */
  tripId: string | null;
  onBack: () => void;
};

/**
 * The shared "tasks to complete" list: things to sort out before the trip,
 * like visas and plugs. Anyone with the link can add, tick and remove.
 */
export function TasksScreen({ tripId, onBack }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tripId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setTasks(await listTasks(tripId));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the list.'));
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  // Everyone sees ticks and new tasks as they happen.
  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`tasks-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `trip_id=eq.${tripId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, load]);

  async function add() {
    if (!tripId || !draft.trim()) return;
    setAdding(true);
    try {
      const next = Math.max(0, ...tasks.map((t) => t.position)) + 1;
      const task = await addTask(tripId, draft, next);
      setTasks((prev) => [...prev, task]);
      setDraft('');
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not add that.'));
    } finally {
      setAdding(false);
    }
  }

  async function toggle(task: Task) {
    const done = !task.done;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done } : t)));
    try {
      const saved = await setTaskDone(task.id, done);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setError(errorMessage(err, 'Could not save the tick.'));
    }
  }

  async function remove(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await deleteTask(task.id);
    } catch (err) {
      setTasks((prev) => [...prev, task]);
      setError(errorMessage(err, 'Could not remove that.'));
    }
  }

  const doneCount = tasks.filter((t) => t.done).length;
  const open = tasks.filter((t) => !t.done);
  const finished = tasks.filter((t) => t.done);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View style={styles.topRow}>
          <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>‹ Welcome page</Text>
          </Pressable>
          {tasks.length > 0 && (
            <Text style={styles.topProgress}>
              {doneCount} of {tasks.length} done
            </Text>
          )}
        </View>
        <Text style={styles.title}>{landing.tasksTitle}</Text>
        <Text style={styles.meta}>
          {landing.family} {landing.headline} · {landing.destination}
        </Text>

        {tasks.length > 0 && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round((doneCount / tasks.length) * 100)}%` }]} />
            </View>
          </View>
        )}

        {error && <Notice text={error} tone="danger" />}
        {!tripId && !loading && <Notice text="Make a trip first, then the list lives with it." />}

        {tripId && (
          <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={add}
              placeholder="Add something to do, like Book airport parking"
              placeholderTextColor={colors.ink3}
              returnKeyType="done"
              blurOnSubmit={false}
              style={styles.input}
              accessibilityLabel="New task"
            />
            <Button title="Add" onPress={add} loading={adding} disabled={!draft.trim()} />
          </View>
        )}

        <View style={styles.card}>
          {open.length === 0 && finished.length === 0 && !loading && <Text style={styles.empty}>Nothing on the list yet.</Text>}
          {open.length === 0 && finished.length > 0 && <Text style={styles.empty}>All done. Nice work.</Text>}
          {open.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={() => toggle(task)} onRemove={() => remove(task)} />
          ))}
        </View>

        {finished.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Done</Text>
            <View style={styles.card}>
              {finished.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={() => toggle(task)} onRemove={() => remove(task)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TaskRow({ task, onToggle, onRemove }: { task: Task; onToggle: () => void; onRemove: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.title}
        hitSlop={6}
        style={styles.rowMain}
      >
        <View style={[styles.check, task.done && styles.checkOn]}>{task.done && <Text style={styles.checkMark}>✓</Text>}</View>
        <Text style={[styles.rowTitle, task.done && styles.rowTitleDone]}>{task.title}</Text>
      </Pressable>
      <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${task.title}`} hitSlop={8} style={styles.remove}>
        <Text style={styles.removeText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.accent, fontWeight: '600' },
  topProgress: { color: colors.ink2, fontSize: 13, fontVariant: ['tabular-nums'] },
  title: { fontSize: 30, fontWeight: '800', color: colors.accent, letterSpacing: -0.5 },
  meta: { color: colors.done, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.done },
  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md },
  sectionHeading: { fontSize: 13, fontWeight: '700', color: colors.ink2, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: spacing.xs },
  empty: { color: colors.ink3, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.done, borderColor: colors.done },
  checkMark: { color: '#fff', fontWeight: '800', fontSize: 15, lineHeight: 17 },
  rowTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.ink },
  rowTitleDone: { color: colors.ink3, textDecorationLine: 'line-through', fontWeight: '500' },
  remove: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.ink3, fontSize: 22, lineHeight: 24 },
});
