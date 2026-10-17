import boldFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';
import regularFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import type { jsPDF } from 'jspdf';
import { TREE_STATUS_META, type TreeStatus } from '@/types/domain';

/** jsPDF's built-in fonts have no Polish glyphs (ą, ę, ł, ś, ż…), so DejaVu Sans is embedded. */
export const PDF_FONT = 'DejaVu';

export const PDF_MIME = 'application/pdf';

export const BRAND_RGB: [number, number, number] = [4, 120, 87];
export const TEXT_MUTED_RGB: [number, number, number] = [100, 116, 139];

export const PAGE_MARGIN_MM = 12;

let fontsPromise: Promise<{ regular: string; bold: string }> | null = null;

async function fetchBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nie udało się pobrać czcionki PDF (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function loadFonts() {
  fontsPromise ??= Promise.all([fetchBase64(regularFontUrl), fetchBase64(boldFontUrl)])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((error: unknown) => {
      fontsPromise = null;
      throw error;
    });
  return fontsPromise;
}

export async function createPdf(orientation: 'portrait' | 'landscape'): Promise<jsPDF> {
  const [{ jsPDF: JsPdf }, fonts] = await Promise.all([import('jspdf'), loadFonts()]);
  const doc = new JsPdf({ orientation, unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
  doc.addFont('DejaVuSans.ttf', PDF_FONT, 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
  doc.addFont('DejaVuSans-Bold.ttf', PDF_FONT, 'bold');
  doc.setFont(PDF_FONT, 'normal');
  return doc;
}

export async function loadAutoTable() {
  return (await import('jspdf-autotable')).autoTable;
}

export const statusRgb = (status: TreeStatus): [number, number, number] => hexToRgb(TREE_STATUS_META[status].color);

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Letterhead of Urząd Miasta Płocka; returns the Y (mm) where content may start. */
export function drawLetterhead(
  doc: jsPDF,
  title: string,
  meta: { generatedAt: Date; generatedBy: string | null; lines?: string[] },
): number {
  const width = doc.internal.pageSize.getWidth();
  const m = PAGE_MARGIN_MM;

  doc.setFillColor(...BRAND_RGB);
  doc.rect(0, 0, width, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(15);
  doc.text('URZĄD MIASTA PŁOCKA', m, 10);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.text('Stary Rynek 1, 09-400 Płock · Ewidencja zieleni miejskiej — system TREE MONITOR', m, 16.5);
  doc.setFontSize(8);
  doc.text(`Wygenerowano: ${meta.generatedAt.toLocaleString('pl-PL')}`, width - m, 10, { align: 'right' });
  if (meta.generatedBy) doc.text(`Sporządził(a): ${meta.generatedBy}`, width - m, 16.5, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(14);
  doc.text(title, m, 32);

  let y = 38;
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED_RGB);
  for (const line of meta.lines ?? []) {
    const wrapped = doc.splitTextToSize(line, width - 2 * m) as string[];
    doc.text(wrapped, m, y);
    y += 4.2 * wrapped.length;
  }
  doc.setTextColor(15, 23, 42);
  return y + 2;
}

export function drawSectionTitle(doc: jsPDF, text: string, y: number) {
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_RGB);
  doc.text(text, PAGE_MARGIN_MM, y);
  doc.setDrawColor(...BRAND_RGB);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN_MM, y + 1.5, doc.internal.pageSize.getWidth() - PAGE_MARGIN_MM, y + 1.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont(PDF_FONT, 'normal');
}

/** "Strona X z N" + document label on every page. Call once, after all content is added. */
export function drawFooters(doc: jsPDF, label: string) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED_RGB);
    doc.text(label, PAGE_MARGIN_MM, height - 6);
    doc.text(`Strona ${page} z ${pages}`, width - PAGE_MARGIN_MM, height - 6, { align: 'right' });
  }
}

/** Shared look of jspdf-autotable tables. */
export const TABLE_STYLES = {
  styles: { font: PDF_FONT, fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.1 },
  headStyles: { font: PDF_FONT, fontStyle: 'bold' as const, fillColor: BRAND_RGB, textColor: [255, 255, 255] as [number, number, number] },
  alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
  margin: { left: PAGE_MARGIN_MM, right: PAGE_MARGIN_MM, bottom: 14 },
};
