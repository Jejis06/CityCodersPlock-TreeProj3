import type { ListTree, SpeciesFrequency } from '../inventoryModel';

/** Everything a format generator needs; generators are pure functions of this object. */
export interface ExportContext {
  trees: ListTree[];
  species: SpeciesFrequency[];
  generatedAt: Date;
  generatedBy: string | null;
  /** Active filters as readable lines, printed in report headers. */
  filtersSummary: string[];
}
