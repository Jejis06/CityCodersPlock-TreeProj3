/** File System Access API (Chromium); not part of TypeScript's DOM typings yet. */
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

type ShowSaveFilePicker = (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

export interface SaveFileRequest {
  fileName: string;
  mimeType: string;
  extension: string;
  description: string;
  /** Called after the user picked the location, so the picker opens while the click still counts as a user gesture. */
  generate: () => Promise<Blob>;
}

export type SaveFileResult = 'saved' | 'downloaded' | 'cancelled';

const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]+/g;

/** Cleans a user-typed name and makes sure it ends with `extension` (e.g. ".pdf"). */
export function buildFileName(rawName: string, extension: string, fallback: string): string {
  let base = rawName.trim().replace(INVALID_FILE_NAME_CHARS, '_');
  if (base.toLowerCase().endsWith(extension.toLowerCase())) base = base.slice(0, -extension.length);
  base = base.replace(/[.\s]+$/, '');
  return `${base || fallback}${extension}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function getSavePicker(): ShowSaveFilePicker | null {
  const picker = (window as Window & { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  // The picker is blocked in cross-origin iframes; fall back to a regular download there.
  return typeof picker === 'function' && window.isSecureContext && window.self === window.top ? picker : null;
}

/** "Save as" dialog (window.showSaveFilePicker) with a fallback to the standard browser download. */
export async function saveFileWithPicker(request: SaveFileRequest): Promise<SaveFileResult> {
  const picker = getSavePicker();
  if (picker) {
    let handle: FileSystemFileHandle | null = null;
    try {
      handle = await picker({
        suggestedName: request.fileName,
        types: [{ description: request.description, accept: { [request.mimeType]: [request.extension] } }],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
    if (handle) {
      const blob = await request.generate();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    }
  }

  downloadBlob(await request.generate(), request.fileName);
  return 'downloaded';
}
