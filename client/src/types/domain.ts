export type Role = 'official' | 'contractor';
export type Device = 'desktop' | 'tablet';
export type PlantType = 'tree' | 'shrub';
export type TreeStatus = 'green' | 'yellow' | 'red' | 'blue';
export type TaskCategory = 'pielegnacja' | 'wycinka' | 'nasadzanie';
export type TaskSubcategory =
  | 'nawozenie'
  | 'podlewanie'
  | 'przycinanie'
  | 'wycinka'
  | 'korowanie'
  | 'palikowanie';
export type TaskStatus = 'assigned' | 'pending_approval' | 'approved' | 'rejected';

export interface User {
  id: string;
  full_name: string;
  role: Role;
  device: Device;
}

export interface Species {
  id: number;
  type: PlantType;
  polish_name: string;
  latin_name: string;
  cultivar: string | null;
}

/** Sensitive fields are absent for contractors (stripped by the server). */
export interface Tree {
  id: string;
  code: string;
  type: PlantType;
  species_id: number;
  latitude: number;
  longitude: number;
  address: string | null;
  plot_number: string | null;
  planting_year: number | null;
  status: TreeStatus;
  contractor_id: string | null;
  contract_number?: string | null;
  contract_scan_url?: string | null;
  funding_source?: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreeListItem extends Tree {
  species_polish_name: string;
  species_latin_name: string;
  species_cultivar: string | null;
  contractor_name: string | null;
}

export interface Task {
  id: string;
  tree_id: string;
  category: TaskCategory;
  subcategory: TaskSubcategory;
  status: TaskStatus;
  assigned_to: string | null;
  created_by: string | null;
  description: string | null;
  contract_number?: string | null;
  contract_scan_url?: string | null;
  contractor_comment: string | null;
  contractor_photo_url: string | null;
  completed_at: string | null;
  official_rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  official: 'Urzędnik',
  contractor: 'Wykonawca',
};

export const PLANT_TYPE_LABELS: Record<PlantType, string> = {
  tree: 'Drzewo',
  shrub: 'Krzew / bylina',
};

export const TREE_STATUS_META: Record<TreeStatus, { label: string; color: string }> = {
  green: { label: 'Zdrowe / prace zatwierdzone', color: '#16a34a' },
  yellow: { label: 'W trakcie prac / do zatwierdzenia', color: '#f59e0b' },
  red: { label: 'Do wycinki', color: '#dc2626' },
  blue: { label: 'Do posadzenia / nowe nasadzenie', color: '#2563eb' },
};

export const TREE_STATUSES: TreeStatus[] = ['green', 'yellow', 'red', 'blue'];

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  pielegnacja: 'Pielęgnacja',
  wycinka: 'Wycinka',
  nasadzanie: 'Nasadzanie',
};

export const TASK_SUBCATEGORY_LABELS: Record<TaskSubcategory, string> = {
  nawozenie: 'Nawożenie',
  podlewanie: 'Podlewanie',
  przycinanie: 'Przycinanie',
  wycinka: 'Wycinka',
  korowanie: 'Korowanie',
  palikowanie: 'Palikowanie',
};

export const TASK_SUBCATEGORIES: Record<TaskCategory, TaskSubcategory[]> = {
  pielegnacja: ['nawozenie', 'podlewanie', 'przycinanie'],
  wycinka: ['wycinka'],
  nasadzanie: ['korowanie', 'palikowanie'],
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: 'Do wykonania',
  pending_approval: 'Czeka na zatwierdzenie',
  approved: 'Zatwierdzone',
  rejected: 'Odrzucone — do poprawki',
};

export const CONTRACTOR_ID = '33333333-3333-3333-3333-333333333333';

export function speciesLabel(polishName: string, cultivar: string | null): string {
  if (!cultivar || cultivar === 'pospolity' || cultivar === 'pospolita') return polishName;
  return `${polishName} ${cultivar}`;
}
