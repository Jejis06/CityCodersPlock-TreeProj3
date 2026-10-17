import type { ListTree } from '../inventoryModel';
import { toPl2000 } from '../lib/geodesy';
import type { ExportContext } from './exportTypes';

/**
 * ASCII DXF (AutoCAD R12 / AC1009 — opens in AutoCAD, BricsCAD, QGIS, LibreCAD and our own CAD underlay).
 * Coordinates in metres, PL-2000 zone 7 (EPSG:2178): x = easting, y = northing.
 * Layers: DRZEWA (POINT + CIRCLE + TEXT), KRZEWY (POINT + square POLYLINE + TEXT).
 */

export const DXF_MIME = 'image/vnd.dxf';

export const DXF_LAYERS = { tree: 'DRZEWA', shrub: 'KRZEWY' } as const;

/** AutoCAD Color Index: 3 = green, 6 = magenta. */
const LAYER_COLORS = { DRZEWA: 3, KRZEWY: 6 } as const;

const SYMBOL_RADIUS_M = 1.5;
const CODE_TEXT_HEIGHT_M = 1.2;
const SPECIES_TEXT_HEIGHT_M = 0.7;

const num = (value: number) => value.toFixed(4);

/** Non-ASCII characters as AutoCAD unicode escapes (\U+0105 = "ą"), so the file stays plain ASCII. */
const dxfText = (value: string) =>
  [...value.replace(/[\r\n]+/g, ' ')]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 63;
      return code < 128 ? ch : `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join('');

class DxfWriter {
  private readonly lines: string[] = [];

  pair(code: number, value: string | number) {
    this.lines.push(String(code), typeof value === 'number' ? num(value) : value);
    return this;
  }

  int(code: number, value: number) {
    this.lines.push(String(code), String(Math.trunc(value)));
    return this;
  }

  point(x: number, y: number, codeOffset = 0) {
    return this.pair(10 + codeOffset, x).pair(20 + codeOffset, y).pair(30 + codeOffset, 0);
  }

  toString() {
    return `${this.lines.join('\r\n')}\r\n`;
  }
}

function writeTables(w: DxfWriter) {
  w.pair(0, 'SECTION').pair(2, 'TABLES');
  w.pair(0, 'TABLE').pair(2, 'LTYPE').int(70, 1);
  w.pair(0, 'LTYPE').pair(2, 'CONTINUOUS').int(70, 0).pair(3, 'Solid line').int(72, 65).int(73, 0).pair(40, 0);
  w.pair(0, 'ENDTAB');

  const layers: [string, number][] = [['0', 7], ...Object.entries(LAYER_COLORS)];
  w.pair(0, 'TABLE').pair(2, 'LAYER').int(70, layers.length);
  for (const [name, color] of layers) {
    w.pair(0, 'LAYER').pair(2, name).int(70, 0).int(62, color).pair(6, 'CONTINUOUS');
  }
  w.pair(0, 'ENDTAB');

  w.pair(0, 'TABLE').pair(2, 'STYLE').int(70, 1);
  w.pair(0, 'STYLE').pair(2, 'STANDARD').int(70, 0).pair(40, 0).pair(41, 1).pair(50, 0).int(71, 0);
  w.pair(42, 2.5).pair(3, 'txt').pair(4, '');
  w.pair(0, 'ENDTAB');
  w.pair(0, 'ENDSEC');
}

function writeText(w: DxfWriter, layer: string, x: number, y: number, height: number, text: string) {
  w.pair(0, 'TEXT').pair(8, layer).point(x, y).pair(40, height).pair(1, dxfText(text)).pair(7, 'STANDARD');
}

function writePlant(w: DxfWriter, tree: ListTree, x: number, y: number) {
  const layer = DXF_LAYERS[tree.type];
  w.pair(0, 'POINT').pair(8, layer).point(x, y);

  if (tree.type === 'tree') {
    w.pair(0, 'CIRCLE').pair(8, layer).point(x, y).pair(40, SYMBOL_RADIUS_M);
  } else {
    const r = SYMBOL_RADIUS_M * 0.85;
    w.pair(0, 'POLYLINE').pair(8, layer).int(66, 1).point(0, 0).int(70, 1);
    for (const [dx, dy] of [[-r, -r], [r, -r], [r, r], [-r, r]] as const) {
      w.pair(0, 'VERTEX').pair(8, layer).point(x + dx, y + dy);
    }
    w.pair(0, 'SEQEND').pair(8, layer);
  }

  const textX = x + SYMBOL_RADIUS_M + 0.6;
  writeText(w, layer, textX, y + 0.2, CODE_TEXT_HEIGHT_M, tree.code);
  writeText(w, layer, textX, y - SPECIES_TEXT_HEIGHT_M - 0.4, SPECIES_TEXT_HEIGHT_M, tree.species_label);
}

export function buildDxfString(ctx: ExportContext): string {
  const points = ctx.trees.map((tree) => ({ tree, ...toPl2000(tree.latitude, tree.longitude) }));
  const xs = points.map((p) => p.easting);
  const ys = points.map((p) => p.northing);
  const pad = 10;
  const min = { x: (xs.length ? Math.min(...xs) : 0) - pad, y: (ys.length ? Math.min(...ys) : 0) - pad };
  const max = { x: (xs.length ? Math.max(...xs) : 0) + pad, y: (ys.length ? Math.max(...ys) : 0) + pad };

  const w = new DxfWriter();
  w.pair(999, 'TREE MONITOR Plock - ewidencja zieleni UM Plocka');
  w.pair(999, `Uklad wspolrzednych: PL-2000 strefa 7 (EPSG:2178), jednostki: metry, x=E y=N`);
  w.pair(999, `Wygenerowano: ${ctx.generatedAt.toISOString()}, roslin: ${ctx.trees.length}`);

  w.pair(0, 'SECTION').pair(2, 'HEADER');
  w.pair(9, '$ACADVER').pair(1, 'AC1009');
  w.pair(9, '$DWGCODEPAGE').pair(3, 'ANSI_1250');
  w.pair(9, '$EXTMIN').point(min.x, min.y);
  w.pair(9, '$EXTMAX').point(max.x, max.y);
  w.pair(9, '$LIMMIN').pair(10, min.x).pair(20, min.y);
  w.pair(9, '$LIMMAX').pair(10, max.x).pair(20, max.y);
  w.pair(0, 'ENDSEC');

  writeTables(w);

  w.pair(0, 'SECTION').pair(2, 'ENTITIES');
  for (const { tree, easting, northing } of points) writePlant(w, tree, easting, northing);
  w.pair(0, 'ENDSEC');
  w.pair(0, 'EOF');
  return w.toString();
}

export function buildDxf(ctx: ExportContext): Blob {
  return new Blob([buildDxfString(ctx)], { type: DXF_MIME });
}
