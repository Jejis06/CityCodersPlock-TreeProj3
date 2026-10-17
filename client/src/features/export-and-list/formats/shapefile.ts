import { PLANT_TYPE_LABELS, TREE_STATUS_META } from '@/types/domain';
import type { ListTree } from '../inventoryModel';
import { PUWG_1992_PRJ, toPuwg1992 } from '../lib/geodesy';
import type { ExportContext } from './exportTypes';
import { buildZip } from './zip';

/**
 * ESRI Shapefile (Point) in PUWG 1992 / EPSG:2180, packed as .zip: .shp + .shx + .dbf + .prj + .cpg.
 * Attribute strings are UTF-8 (declared in .cpg); DBF field names are limited to 10 characters.
 */

export const SHAPEFILE_ZIP_MIME = 'application/zip';

const SHAPE_TYPE_POINT = 1;
const SHP_HEADER_BYTES = 100;
const POINT_RECORD_BYTES = 28; // 8 (record header) + 4 (shape type) + 16 (x, y)

type DbfField =
  | { name: string; type: 'C'; length: number; value: (t: ListTree) => string | null }
  | { name: string; type: 'N'; length: number; decimals: number; value: (t: ListTree) => number | null };

const DBF_FIELDS: DbfField[] = [
  { name: 'KOD', type: 'C', length: 12, value: (t) => t.code },
  { name: 'TYP', type: 'C', length: 16, value: (t) => PLANT_TYPE_LABELS[t.type] },
  { name: 'GATUNEK', type: 'C', length: 80, value: (t) => t.species_label },
  { name: 'LACINA', type: 'C', length: 80, value: (t) => t.species_latin_name },
  { name: 'ADRES', type: 'C', length: 120, value: (t) => t.address },
  { name: 'ULICA', type: 'C', length: 60, value: (t) => t.street },
  { name: 'DZIALKA', type: 'C', length: 40, value: (t) => t.plot_number },
  { name: 'ROK', type: 'N', length: 4, decimals: 0, value: (t) => t.planting_year },
  { name: 'STATUS', type: 'C', length: 10, value: (t) => t.status },
  { name: 'STATUS_PL', type: 'C', length: 60, value: (t) => TREE_STATUS_META[t.status].label },
  { name: 'WYKONAWCA', type: 'C', length: 60, value: (t) => t.contractor_name },
  { name: 'Z_DECYZJI', type: 'C', length: 3, value: (t) => (t.from_decision ? 'TAK' : 'NIE') },
  { name: 'DECYZJA', type: 'C', length: 60, value: (t) => t.decision_ref },
  { name: 'LAT', type: 'N', length: 12, decimals: 7, value: (t) => t.latitude },
  { name: 'LON', type: 'N', length: 12, decimals: 7, value: (t) => t.longitude },
];

const encoder = new TextEncoder();

/** UTF-8 bytes cut to `maxBytes` without splitting a multi-byte character. */
function utf8Fit(value: string, maxBytes: number): Uint8Array {
  let bytes = encoder.encode(value);
  if (bytes.length <= maxBytes) return bytes;
  let end = maxBytes;
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  bytes = bytes.slice(0, end);
  return bytes;
}

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function writeMainHeader(view: DataView, fileBytes: number, bbox: Bbox) {
  view.setInt32(0, 9994, false);
  view.setInt32(24, fileBytes / 2, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, SHAPE_TYPE_POINT, true);
  view.setFloat64(36, bbox.minX, true);
  view.setFloat64(44, bbox.minY, true);
  view.setFloat64(52, bbox.maxX, true);
  view.setFloat64(60, bbox.maxY, true);
}

function buildShpAndShx(points: { x: number; y: number }[]): { shp: Uint8Array; shx: Uint8Array } {
  const bbox: Bbox = points.length
    ? {
        minX: Math.min(...points.map((p) => p.x)),
        minY: Math.min(...points.map((p) => p.y)),
        maxX: Math.max(...points.map((p) => p.x)),
        maxY: Math.max(...points.map((p) => p.y)),
      }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  const shpBytes = SHP_HEADER_BYTES + POINT_RECORD_BYTES * points.length;
  const shxBytes = SHP_HEADER_BYTES + 8 * points.length;
  const shp = new DataView(new ArrayBuffer(shpBytes));
  const shx = new DataView(new ArrayBuffer(shxBytes));
  writeMainHeader(shp, shpBytes, bbox);
  writeMainHeader(shx, shxBytes, bbox);

  points.forEach((point, i) => {
    const offset = SHP_HEADER_BYTES + POINT_RECORD_BYTES * i;
    shp.setInt32(offset, i + 1, false);
    shp.setInt32(offset + 4, 10, false); // content length in 16-bit words
    shp.setInt32(offset + 8, SHAPE_TYPE_POINT, true);
    shp.setFloat64(offset + 12, point.x, true);
    shp.setFloat64(offset + 20, point.y, true);

    const indexOffset = SHP_HEADER_BYTES + 8 * i;
    shx.setInt32(indexOffset, offset / 2, false);
    shx.setInt32(indexOffset + 4, 10, false);
  });

  return { shp: new Uint8Array(shp.buffer), shx: new Uint8Array(shx.buffer) };
}

function buildDbf(trees: ListTree[], date: Date): Uint8Array {
  const headerBytes = 32 + 32 * DBF_FIELDS.length + 1;
  const recordBytes = 1 + DBF_FIELDS.reduce((sum, f) => sum + f.length, 0);
  const bytes = new Uint8Array(headerBytes + recordBytes * trees.length + 1);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x03; // dBASE III without memo
  bytes[1] = date.getFullYear() - 1900;
  bytes[2] = date.getMonth() + 1;
  bytes[3] = date.getDate();
  view.setUint32(4, trees.length, true);
  view.setUint16(8, headerBytes, true);
  view.setUint16(10, recordBytes, true);

  DBF_FIELDS.forEach((field, i) => {
    const base = 32 + 32 * i;
    bytes.set(encoder.encode(field.name).slice(0, 10), base);
    bytes[base + 11] = field.type.charCodeAt(0);
    bytes[base + 16] = field.length;
    bytes[base + 17] = field.type === 'N' ? field.decimals : 0;
  });
  bytes[headerBytes - 1] = 0x0d;

  trees.forEach((tree, r) => {
    let offset = headerBytes + recordBytes * r;
    bytes.fill(0x20, offset, offset + recordBytes);
    offset += 1; // deletion flag: space = active record
    for (const field of DBF_FIELDS) {
      if (field.type === 'C') {
        bytes.set(utf8Fit(field.value(tree) ?? '', field.length), offset);
      } else {
        const value = field.value(tree);
        if (value !== null && Number.isFinite(value)) {
          const text = value.toFixed(field.decimals).slice(0, field.length);
          bytes.set(encoder.encode(text.padStart(field.length, ' ')), offset);
        }
      }
      offset += field.length;
    }
  });
  bytes[bytes.length - 1] = 0x1a;
  return bytes;
}

/** `layerName` becomes the file name inside the ZIP (e.g. "Raport_Zielen_Plock_2026-10-17.shp"). */
export function buildShapefileZip(ctx: ExportContext, layerName: string): Blob {
  const points = ctx.trees.map((tree) => {
    const p = toPuwg1992(tree.latitude, tree.longitude);
    return { x: p.easting, y: p.northing };
  });
  const { shp, shx } = buildShpAndShx(points);
  return buildZip(
    {
      [`${layerName}.shp`]: shp,
      [`${layerName}.shx`]: shx,
      [`${layerName}.dbf`]: buildDbf(ctx.trees, ctx.generatedAt),
      [`${layerName}.prj`]: PUWG_1992_PRJ,
      [`${layerName}.cpg`]: 'UTF-8',
    },
    SHAPEFILE_ZIP_MIME,
  );
}
