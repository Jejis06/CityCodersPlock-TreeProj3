import type { PlantType, Task } from '@/types/domain';

/** Wiersz z GET /api/tasks: zadanie + dane rośliny + informacja o blokadzie (MUTEX). */
export interface QueueTask extends Task {
  tree_code: string;
  tree_type: PlantType;
  tree_address: string | null;
  tree_status: string;
  species_polish_name: string;
  species_latin_name: string;
  species_cultivar: string | null;
  locked_by_name: string | null;
}
