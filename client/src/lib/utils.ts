import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

interface TaskActivityDates {
  completed_at: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Data ostatniej aktywności zadania — ten sam klucz co `ORDER BY COALESCE(completed_at, reviewed_at, created_at)` na serwerze. */
export const taskActivityAt = (task: TaskActivityDates): string =>
  task.completed_at ?? task.reviewed_at ?? task.created_at;

/** Komparator „najnowsze na górze, najstarsze na dole” (daty ISO UTC porównywane tekstowo). */
export function compareTasksNewestFirst(a: TaskActivityDates, b: TaskActivityDates): number {
  return taskActivityAt(b).localeCompare(taskActivityAt(a)) || b.created_at.localeCompare(a.created_at);
}
