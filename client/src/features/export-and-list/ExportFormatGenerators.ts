import type { ExportContext } from './formats/exportTypes';

/**
 * Registry of export formats for "Eksportuj przefiltrowane dane".
 * Each generator is a pure `(ExportContext, baseName) => Promise<Blob>` living in `formats/*` and loaded lazily,
 * so adding a new format = one file in `formats/` + one entry below.
 */

export type ExportFormatId = 'xlsx' | 'dxf' | 'shp' | 'pdf';

export interface ExportFormat {
  id: ExportFormatId;
  label: string;
  extension: string;
  mimeType: string;
  /** Short hint under the button. */
  description: string;
  /** Description shown in the "Save as" dialog. */
  pickerDescription: string;
  generate: (ctx: ExportContext, baseName: string) => Promise<Blob>;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'xlsx',
    label: 'Excel',
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    description: 'Arkusz 1 „Ewidencja Roślin” + Arkusz 2 „Wykres Gatunków OX-OY” z wykresem słupkowym',
    pickerDescription: 'Skoroszyt programu Excel',
    generate: async (ctx) => (await import('./formats/xlsx')).buildXlsx(ctx),
  },
  {
    id: 'dxf',
    label: 'AutoCAD',
    extension: '.dxf',
    mimeType: 'image/vnd.dxf',
    description: 'Warstwy DRZEWA i KRZEWY, punkty + kody, układ PL-2000 strefa 7 (EPSG:2178)',
    pickerDescription: 'Rysunek AutoCAD DXF',
    generate: async (ctx) => (await import('./formats/dxf')).buildDxf(ctx),
  },
  {
    id: 'shp',
    label: 'GIS Shapefile',
    extension: '.zip',
    mimeType: 'application/zip',
    description: 'Paczka .zip: .shp/.shx/.dbf/.prj/.cpg, punkty w PUWG 1992 (EPSG:2180)',
    pickerDescription: 'Shapefile (archiwum ZIP)',
    generate: async (ctx, baseName) => (await import('./formats/shapefile')).buildShapefileZip(ctx, baseName),
  },
  {
    id: 'pdf',
    label: 'Raport PDF',
    extension: '.pdf',
    mimeType: 'application/pdf',
    description: 'Nagłówek UM Płocka, podsumowanie i wykres gatunków, tabela roślin',
    pickerDescription: 'Dokument PDF',
    generate: async (ctx) => (await import('./formats/pdfReport')).buildPdfReport(ctx),
  },
];

export function getExportFormat(id: ExportFormatId): ExportFormat {
  const format = EXPORT_FORMATS.find((f) => f.id === id);
  if (!format) throw new Error(`Nieznany format eksportu: ${id}`);
  return format;
}

export function defaultReportBaseName(date: string): string {
  return `Raport_Zielen_Plock_${date}`;
}
