import type { TaskCategory, TaskSubcategory, TreeStatus } from '../types.js';

export const LOCK_TIMEOUT_MINUTES = 5;

export const CONTRACTOR_ID = '33333333-3333-3333-3333-333333333333';

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

export const SENSITIVE_FIELDS = ['contract_number', 'contract_scan_url', 'funding_source'] as const;
