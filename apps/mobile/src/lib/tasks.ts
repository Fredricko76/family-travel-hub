import { supabase } from './supabase';
import type { Task } from '../types';

const COLUMNS = 'id, trip_id, title, done, done_at, done_by, position, created_at';

/** The shared to-do list for a trip, unticked first, in the order they were added. */
export async function listTasks(tripId: string): Promise<Task[]> {
  const { data, error } = await supabase.from('tasks').select(COLUMNS).eq('trip_id', tripId).order('position').order('created_at');
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function addTask(tripId: string, title: string, position: number): Promise<Task> {
  const clean = title.trim();
  if (!clean) throw new Error('Type what needs doing first.');
  const { data, error } = await supabase.from('tasks').insert({ trip_id: tripId, title: clean, position }).select(COLUMNS).single();
  if (error) throw error;
  return data as Task;
}

/** Tick or untick a task. Remembers who ticked it and when. */
export async function setTaskDone(taskId: string, done: boolean): Promise<Task> {
  const { data: authData } = await supabase.auth.getUser();
  const patch = done
    ? { done: true, done_at: new Date().toISOString(), done_by: authData.user?.id ?? null }
    : { done: false, done_at: null, done_by: null };
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', taskId).select(COLUMNS).single();
  if (error) throw error;
  return data as Task;
}

export async function renameTask(taskId: string, title: string): Promise<Task> {
  const clean = title.trim();
  if (!clean) throw new Error('A task needs some words.');
  const { data, error } = await supabase.from('tasks').update({ title: clean }).eq('id', taskId).select(COLUMNS).single();
  if (error) throw error;
  return data as Task;
}

export async function deleteTask(taskId: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
}
