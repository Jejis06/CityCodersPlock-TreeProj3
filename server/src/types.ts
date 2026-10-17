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
  contract_number: string | null;
  contract_scan_url: string | null;
  funding_source: string | null;
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
  contract_number: string | null;
  contract_scan_url: string | null;
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
