import type { TaskCategory, TaskSubcategory, TreeStatus } from '../types.js';

export const LOCK_TIMEOUT_MINUTES = 5;

export const CONTRACTOR_ID = '33333333-3333-3333-3333-333333333333';
export const SECOND_CONTRACTOR_ID = '44444444-4444-4444-4444-444444444444';

export const TREE_STATUSES: readonly TreeStatus[] = ['green', 'yellow', 'red', 'blue'];

export const TASK_SUBCATEGORIES: Record<TaskCategory, readonly TaskSubcategory[]> = {
  pielegnacja: ['nawozenie', 'podlewanie', 'przycinanie'],
  wycinka: ['wycinka'],
  nasadzanie: ['posadzenie', 'korowanie', 'palikowanie'],
};

export const TREE_STATUS_FOR_CATEGORY: Record<TaskCategory, TreeStatus> = {
  pielegnacja: 'yellow',
  wycinka: 'red',
  nasadzanie: 'blue',
};

/** Domyślne sortowanie zadań (alias tabeli `k`): ostatnia aktywność malejąco — najnowsze na górze. */
export const TASK_NEWEST_FIRST_ORDER = 'COALESCE(k.completed_at, k.reviewed_at, k.created_at) DESC, k.created_at DESC, k.id';

export const SENSITIVE_FIELDS = ['contract_number', 'contract_scan_url', 'funding_source'] as const;
