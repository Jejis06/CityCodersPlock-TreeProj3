import { PLANT_TYPE_LABELS, TREE_STATUS_META } from '@/types/domain';
import type { ListTree } from '../inventoryModel';
import { toPl2000 } from '../lib/geodesy';
import type { AreaBounds, MapAreaImage } from '../mapAreaCapture';
import {
  PAGE_MARGIN_MM,
  PDF_FONT,
  TABLE_STYLES,
  createPdf,
  drawFooters,
  drawLetterhead,
  drawSectionTitle,
  loadAutoTable,
  statusRgb,
} from './pdfShared';

export interface MapAreaPdfInput {
  area: AreaBounds;
  image: MapAreaImage;
  trees: ListTree[];
  baseLayerName: string;
  generatedAt: Date;
  generatedBy: string | null;
}

const formatCorner = (lat: number, lng: number) => {
  const p = toPl2000(lat, lng);
  return `${lat.toFixed(6)}, ${lng.toFixed(6)} (PL-2000/7: X ${p.northing.toFixed(2)}, Y ${p.easting.toFixed(2)})`;
};

/** A4 landscape: letterhead, map snapshot (JPEG), then the table of plants inside the rectangle. */
export async function buildMapAreaPdf(input: MapAreaPdfInput): Promise<Blob> {
  const [doc, autoTable] = await Promise.all([createPdf('landscape'), loadAutoTable()]);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const m = PAGE_MARGIN_MM;

  const y = drawLetterhead(doc, 'Wycinek mapy ewidencji zieleni', {
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    lines: [
      `Obszar — narożnik SW: ${formatCorner(input.area.south, input.area.west)}; narożnik NE: ${formatCorner(input.area.north, input.area.east)}`,
      `Podkład: ${input.baseLayerName} (WMS GUGiK). Roślin w zaznaczonym obszarze: ${input.trees.length}.`,
    ],
  });

  const maxW = pageWidth - 2 * m;
  const maxH = pageHeight - y - 14;
  const ratio = input.image.width / input.image.height;
  const w = Math.min(maxW, maxH * ratio);
  const h = w / ratio;
  const x = (pageWidth - w) / 2;
  doc.addImage(input.image.dataUrl, 'JPEG', x, y, w, h, undefined, 'FAST');
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);

  doc.addPage();
  drawSectionTitle(doc, `Rośliny w zaznaczonym obszarze (${input.trees.length})`, 16);
  if (input.trees.length === 0) {
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(9);
    doc.text('W zaznaczonym obszarze nie ma roślin z ewidencji.', m, 26);
  } else {
    autoTable(doc, {
      ...TABLE_STYLES,
      startY: 21,
      head: [['Lp.', 'Kod', 'Typ', 'Gatunek', 'Adres', 'Działka', 'Rok', 'Status', 'Szer. / Dł. (WGS84)', 'X / Y PL-2000/7 [m]']],
      body: input.trees.map((t, i) => {
        const p = toPl2000(t.latitude, t.longitude);
        return [
          String(i + 1),
          t.code,
          PLANT_TYPE_LABELS[t.type],
          `${t.species_label}\n${t.species_latin_name}`,
          t.address ?? '—',
          t.plot_number ?? '—',
          t.planting_year ? String(t.planting_year) : '—',
          TREE_STATUS_META[t.status].label,
          `${t.latitude.toFixed(6)}\n${t.longitude.toFixed(6)}`,
          `${p.northing.toFixed(2)}\n${p.easting.toFixed(2)}`,
        ];
      }),
      columnStyles: {
        0: { halign: 'right', cellWidth: 9 },
        1: { fontStyle: 'bold', cellWidth: 18 },
        6: { halign: 'center', cellWidth: 11 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 7) {
          const tree = input.trees[data.row.index];
          if (tree) data.cell.styles.textColor = statusRgb(tree.status);
        }
      },
    });
  }

  drawFooters(doc, 'Urząd Miasta Płocka · Wycinek mapy ewidencji zieleni (TREE MONITOR)');
  return doc.output('blob');
}
