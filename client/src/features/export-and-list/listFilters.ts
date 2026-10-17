import {
  PLANT_TYPE_LABELS,
  TREE_STATUS_META,
  type PlantType,
  type TreeStatus,
} from '@/types/domain';
import type { ListTree } from './inventoryModel';

export const NO_CONTRACTOR = '__none__';

/** Compact status names for chips and table cells (full labels: TREE_STATUS_META). */
export const STATUS_SHORT_LABELS: Record<TreeStatus, string> = {
  green: 'Zdrowe',
  yellow: 'W trakcie prac',
  red: 'Do wycinki',
  blue: 'Do posadzenia',
};

export type DecisionFilter = 'all' | 'yes' | 'no';

export interface ListFilters {
  /** Free text matched against the address (diacritics-insensitive), filled by the street autocomplete. */
  address: string;
  plantingYear: number | null;
  speciesId: number | null;
  /** User id, or NO_CONTRACTOR for plants without a contractor. */
  contractorId: string | null;
  statuses: TreeStatus[];
  type: PlantType | null;
  decision: DecisionFilter;
}

export const EMPTY_LIST_FILTERS: ListFilters = {
  address: '',
  plantingYear: null,
  speciesId: null,
  contractorId: null,
  statuses: [],
  type: null,
  decision: 'all',
};

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase().trim();
}

export function hasActiveListFilters(filters: ListFilters): boolean {
  return (
    filters.address.trim() !== '' ||
    filters.plantingYear !== null ||
    filters.speciesId !== null ||
    filters.contractorId !== null ||
    filters.statuses.length > 0 ||
    filters.type !== null ||
    filters.decision !== 'all'
  );
}

export function applyListFilters(trees: ListTree[], filters: ListFilters): ListTree[] {
  const address = normalizeText(filters.address);
  return trees.filter((tree) => {
    if (address && !normalizeText(tree.address ?? '').includes(address)) return false;
    if (filters.plantingYear !== null && tree.planting_year !== filters.plantingYear) return false;
    if (filters.speciesId !== null && tree.species_id !== filters.speciesId) return false;
    if (filters.contractorId === NO_CONTRACTOR && tree.contractor_id !== null) return false;
    if (filters.contractorId && filters.contractorId !== NO_CONTRACTOR && tree.contractor_id !== filters.contractorId) {
      return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(tree.status)) return false;
    if (filters.type && tree.type !== filters.type) return false;
    if (filters.decision === 'yes' && !tree.from_decision) return false;
    if (filters.decision === 'no' && tree.from_decision) return false;
    return true;
  });
}

/** Human-readable description of active filters (used in report headers). */
export function describeListFilters(
  filters: ListFilters,
  lookups: { speciesLabel: (id: number) => string | undefined; contractorName: (id: string) => string | undefined },
): string[] {
  const parts: string[] = [];
  if (filters.address.trim()) parts.push(`Adres: „${filters.address.trim()}”`);
  if (filters.type) parts.push(`Typ: ${PLANT_TYPE_LABELS[filters.type]}`);
  if (filters.speciesId !== null) parts.push(`Gatunek: ${lookups.speciesLabel(filters.speciesId) ?? filters.speciesId}`);
  if (filters.plantingYear !== null) parts.push(`Rok posadzenia: ${filters.plantingYear}`);
  if (filters.contractorId === NO_CONTRACTOR) parts.push('Wykonawca: brak');
  else if (filters.contractorId) parts.push(`Wykonawca: ${lookups.contractorName(filters.contractorId) ?? '—'}`);
  if (filters.statuses.length > 0) {
    parts.push(`Status: ${filters.statuses.map((s) => TREE_STATUS_META[s].label).join(', ')}`);
  }
  if (filters.decision === 'yes') parts.push('Tylko rośliny z decyzji');
  if (filters.decision === 'no') parts.push('Bez decyzji administracyjnej');
  return parts;
}
