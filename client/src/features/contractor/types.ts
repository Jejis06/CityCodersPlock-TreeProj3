import type { Task } from '@/types/domain';

/** Task row as returned by GET /api/tasks (joined with tree + species; no contract/funding fields). */
export interface ContractorTask extends Task {
  tree_code: string;
  tree_type: 'tree' | 'shrub';
  tree_latitude: number;
  tree_longitude: number;
  tree_address: string | null;
  tree_plot_number: string | null;
  tree_status: 'green' | 'yellow' | 'red' | 'blue';
  species_polish_name: string;
  species_latin_name: string;
  species_cultivar: string | null;
  reviewed_by_name: string | null;
}

export const DEMO_PHOTOS = [
  { url: '/demo/photos/watering.svg', label: 'Podlewanie' },
  { url: '/demo/photos/pruning.svg', label: 'Przycinanie' },
  { url: '/demo/photos/fertilizing.svg', label: 'Nawożenie' },
] as const;
