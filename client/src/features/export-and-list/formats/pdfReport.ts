import type { jsPDF } from 'jspdf';
import { PLANT_TYPE_LABELS, TREE_STATUS_META, TREE_STATUSES } from '@/types/domain';
import type { SpeciesFrequency } from '../inventoryModel';
import type { ExportContext } from './exportTypes';
import {
  BRAND_RGB,
  PAGE_MARGIN_MM,
  PDF_FONT,
  TABLE_STYLES,
  TEXT_MUTED_RGB,
  createPdf,
  drawFooters,
  drawLetterhead,
  drawSectionTitle,
  loadAutoTable,
  statusRgb,
} from './pdfShared';

const SHRUB_RGB: [number, number, number] = [124, 58, 237];
const CHART_MAX_BARS = 15;

/** Bar chart (OX: species, OY: count) drawn with PDF vector primitives. Returns the bottom Y. */
function drawSpeciesChart(doc: jsPDF, species: SpeciesFrequency[], x: number, y: number, w: number, h: number): number {
  const bars = species.slice(0, CHART_MAX_BARS);
  const maxCount = Math.max(1, ...bars.map((s) => s.count));
  const labelBand = 24;
  const axisLeft = x + 8;
  const plotTop = y + 9;
  const plotBottom = y + h - labelBand;
  const plotHeight = plotBottom - plotTop;
  const plotWidth = x + w - axisLeft;

  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_MUTED_RGB);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.1);
  const step = Math.max(1, Math.ceil(maxCount / 5));
  for (let v = 0; v <= maxCount; v += step) {
    const ty = plotBottom - (v / maxCount) * plotHeight;
    doc.line(axisLeft, ty, x + w, ty);
    doc.text(String(v), axisLeft - 1.5, ty + 1, { align: 'right' });
  }

  const slot = plotWidth / Math.max(bars.length, 1);
  const barWidth = Math.min(14, slot * 0.65);
  bars.forEach((s, i) => {
    const barHeight = (s.count / maxCount) * plotHeight;
    const bx = axisLeft + slot * i + (slot - barWidth) / 2;
    doc.setFillColor(...(s.type === 'shrub' ? SHRUB_RGB : BRAND_RGB));
    doc.rect(bx, plotBottom - barHeight, barWidth, barHeight, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont(PDF_FONT, 'bold');
    doc.text(String(s.count), bx + barWidth / 2, plotBottom - barHeight - 1, { align: 'center' });
    doc.setFont(PDF_FONT, 'normal');
    doc.setTextColor(51, 65, 85);
    const label = s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label;
    doc.text(label, bx + barWidth / 2, plotBottom + 2.5, { angle: -40 });
  });

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.line(axisLeft, plotTop, axisLeft, plotBottom);
  doc.line(axisLeft, plotBottom, x + w, plotBottom);
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED_RGB);
  doc.text('OY: ilość wystąpień', x, y + 2);
  doc.text('OX: gatunek', x + w, y + h + 2, { align: 'right' });
  if (species.length > bars.length) {
    doc.text(`(pokazano ${bars.length} najliczniejszych z ${species.length} gatunków)`, axisLeft, y + h + 2);
  }
  doc.setTextColor(15, 23, 42);
  return y + h;
}

export async function buildPdfReport(ctx: ExportContext): Promise<Blob> {
  const [doc, autoTable] = await Promise.all([createPdf('landscape'), loadAutoTable()]);
  const width = doc.internal.pageSize.getWidth();
  const m = PAGE_MARGIN_MM;

  let y = drawLetterhead(doc, 'Raport ewidencji zieleni miejskiej', {
    generatedAt: ctx.generatedAt,
    generatedBy: ctx.generatedBy,
    lines: [
      ctx.filtersSummary.length > 0
        ? `Zakres danych (filtry): ${ctx.filtersSummary.join(' · ')}`
        : 'Zakres danych: cała ewidencja (bez filtrów)',
    ],
  });

  const trees = ctx.trees.filter((t) => t.type === 'tree').length;
  const statusLine = TREE_STATUSES.map(
    (s) => `${TREE_STATUS_META[s].label}: ${ctx.trees.filter((t) => t.status === s).length}`,
  ).join('   ·   ');
  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(
    `Roślin: ${ctx.trees.length}   (drzewa: ${trees}, krzewy/byliny: ${ctx.trees.length - trees})   ·   gatunków: ${ctx.species.length}   ·   z decyzji: ${ctx.trees.filter((t) => t.from_decision).length}`,
    m,
    y + 2,
  );
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(8);
  doc.text(statusLine, m, y + 7);
  y += 14;

  drawSectionTitle(doc, 'Podsumowanie gatunków', y);
  y += 5;
  const chartWidth = (width - 2 * m) * 0.58;
  drawSpeciesChart(doc, ctx.species, m, y + 2, chartWidth, 70);
  autoTable(doc, {
    ...TABLE_STYLES,
    startY: y + 2,
    margin: { ...TABLE_STYLES.margin, left: m + chartWidth + 6 },
    tableWidth: width - 2 * m - chartWidth - 6,
    head: [['Gatunek', 'Typ', 'Ilość']],
    body: ctx.species.map((s) => [s.label, PLANT_TYPE_LABELS[s.type], String(s.count)]),
    foot: [['Razem', '', String(ctx.trees.length)]],
    footStyles: { font: PDF_FONT, fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    columnStyles: { 2: { halign: 'right', cellWidth: 14 } },
  });

  doc.addPage();
  drawSectionTitle(doc, `Tabela roślin (${ctx.trees.length})`, 16);
  autoTable(doc, {
    ...TABLE_STYLES,
    startY: 21,
    head: [['Lp.', 'Kod', 'Typ', 'Gatunek', 'Adres', 'Działka', 'Rok', 'Status', 'Wykonawca', 'Decyzja', 'Szer. / Dł. (WGS84)']],
    body: ctx.trees.map((t, i) => [
      String(i + 1),
      t.code,
      PLANT_TYPE_LABELS[t.type],
      `${t.species_label}\n${t.species_latin_name}`,
      t.address ?? '—',
      t.plot_number ?? '—',
      t.planting_year ? String(t.planting_year) : '—',
      TREE_STATUS_META[t.status].label,
      t.contractor_name ?? '—',
      t.decision_ref ?? '—',
      `${t.latitude.toFixed(6)}\n${t.longitude.toFixed(6)}`,
    ]),
    columnStyles: {
      0: { halign: 'right', cellWidth: 9 },
      1: { fontStyle: 'bold', cellWidth: 18 },
      6: { halign: 'center', cellWidth: 11 },
      7: { cellWidth: 34 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        const tree = ctx.trees[data.row.index];
        if (tree) data.cell.styles.textColor = statusRgb(tree.status);
      }
    },
  });

  drawFooters(doc, 'Urząd Miasta Płocka · Raport ewidencji zieleni (TREE MONITOR)');
  return doc.output('blob');
}
