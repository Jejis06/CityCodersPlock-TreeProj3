import { strToU8, zipSync, type Zippable } from 'fflate';

/** Builds a ZIP archive from text/binary entries (used by .xlsx and the Shapefile bundle). */
export function buildZip(entries: Record<string, string | Uint8Array>, mimeType: string): Blob {
  const files: Zippable = {};
  for (const [path, content] of Object.entries(entries)) {
    files[path] = typeof content === 'string' ? strToU8(content) : content;
  }
  const bytes = zipSync(files, { level: 6 });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType });
}
