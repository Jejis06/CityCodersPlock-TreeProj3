import { PLANT_TYPE_LABELS, TREE_STATUS_META } from '@/types/domain';
import type { ListTree } from '../inventoryModel';
import { toPl2000 } from '../lib/geodesy';

export type CellValue = string | number | null;
export type NumberFormat = 'integer' | 'degrees' | 'meters';

export interface ExportColumn {
  header: string;
  /** Approximate width in characters (Excel column width). */
  width: number;
  value: (tree: ListTree) => CellValue;
  numberFormat?: NumberFormat;
}

const pl2000Cache = new WeakMap<ListTree, ReturnType<typeof toPl2000>>();
function pl2000(tree: ListTree) {
  let point = pl2000Cache.get(tree);
  if (!point) {
    point = toPl2000(tree.latitude, tree.longitude);
    pl2000Cache.set(tree, point);
  }
  return point;
}

/** Columns of the "Ewidencja Roślin" sheet. Contract and funding fields are official-only data. */
export const INVENTORY_COLUMNS: ExportColumn[] = [
  { header: 'Kod ewidencyjny', width: 14, value: (t) => t.code },
  { header: 'Typ', width: 14, value: (t) => PLANT_TYPE_LABELS[t.type] },
  { header: 'Gatunek', width: 30, value: (t) => t.species_label },
  { header: 'Nazwa łacińska', width: 28, value: (t) => t.species_latin_name },
  { header: 'Adres', width: 32, value: (t) => t.address },
  { header: 'Ulica / lokalizacja', width: 22, value: (t) => t.street },
  { header: 'Nr działki', width: 22, value: (t) => t.plot_number },
  { header: 'Rok posadzenia', width: 10, value: (t) => t.planting_year, numberFormat: 'integer' },
  { header: 'Status', width: 30, value: (t) => TREE_STATUS_META[t.status].label },
  { header: 'Wykonawca', width: 20, value: (t) => t.contractor_name },
  { header: 'Z decyzji', width: 9, value: (t) => (t.from_decision ? 'TAK' : 'NIE') },
  { header: 'Decyzja / podstawa', width: 26, value: (t) => t.decision_ref },
  { header: 'Szer. geogr. (WGS84)', width: 14, value: (t) => t.latitude, numberFormat: 'degrees' },
  { header: 'Dł. geogr. (WGS84)', width: 14, value: (t) => t.longitude, numberFormat: 'degrees' },
  { header: 'X PL-2000/7 [m] (N)', width: 15, value: (t) => pl2000(t).northing, numberFormat: 'meters' },
  { header: 'Y PL-2000/7 [m] (E)', width: 15, value: (t) => pl2000(t).easting, numberFormat: 'meters' },
  { header: 'Nr umowy', width: 18, value: (t) => t.contract_number ?? null },
  { header: 'Źródło finansowania', width: 32, value: (t) => t.funding_source ?? null },
  { header: 'Uwagi', width: 40, value: (t) => t.notes },
];
