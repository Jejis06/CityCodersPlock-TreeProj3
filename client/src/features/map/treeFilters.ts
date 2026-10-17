import type { PlantType, Species, TaskCategory, TreeStatus } from '@/types/domain';

export interface TreeFilters {
  statuses: TreeStatus[];
  type: PlantType | null;
  species: Species | null;
  plantingYear: number | null;
  taskCategory: TaskCategory | null;
}

export const EMPTY_TREE_FILTERS: TreeFilters = {
  statuses: [],
  type: null,
  species: null,
  plantingYear: null,
  taskCategory: null,
};

export function hasActiveFilters(filters: TreeFilters): boolean {
  return (
    filters.statuses.length > 0 ||
    filters.type !== null ||
    filters.species !== null ||
    filters.plantingYear !== null ||
    filters.taskCategory !== null
  );
}

/** Query string for GET /api/trees (empty string when nothing is filtered). */
export function treeFiltersToQuery(filters: TreeFilters): string {
  const params = new URLSearchParams();
  if (filters.statuses.length > 0) params.set('status', filters.statuses.join(','));
  if (filters.type) params.set('type', filters.type);
  if (filters.species) params.set('species_id', String(filters.species.id));
  if (filters.plantingYear !== null) params.set('planting_year', String(filters.plantingYear));
  if (filters.taskCategory) params.set('task_category', filters.taskCategory);
  const query = params.toString();
  return query ? `?${query}` : '';
}
