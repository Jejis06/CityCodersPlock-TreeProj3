import {
  ArrowDownToLine,
  CheckCircle2,
  Download,
  FileBox,
  FileSpreadsheet,
  FileText,
  Globe2,
  PencilRuler,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Input } from '@/components/shared/FormControls';
import { cn } from '@/lib/utils';
import { EXPORT_FORMATS, defaultReportBaseName, type ExportFormat, type ExportFormatId } from './ExportFormatGenerators';
import { speciesFrequency, todayIsoDate, type ListTree } from './inventoryModel';
import { buildFileName, saveFileWithPicker } from './lib/saveFile';
import { FIELD_CLASS, FIELD_LABEL_CLASS, PANEL_CLASS, PanelHeader } from './listUi';

const FORMAT_LOOK: Record<ExportFormatId, { icon: LucideIcon; tile: string }> = {
  xlsx: { icon: FileSpreadsheet, tile: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  dxf: { icon: PencilRuler, tile: 'bg-orange-50 text-orange-600 ring-orange-100' },
  shp: { icon: Globe2, tile: 'bg-sky-50 text-sky-700 ring-sky-100' },
  pdf: { icon: FileText, tile: 'bg-rose-50 text-rose-600 ring-rose-100' },
};

const ICON_TILE = 'flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset';

type Scope = 'filtered' | 'selected';

interface ExportPanelProps {
  filteredTrees: ListTree[];
  selectedTrees: ListTree[];
  filtersSummary: string[];
  generatedBy: string | null;
}

export function ExportPanel({ filteredTrees, selectedTrees, filtersSummary, generatedBy }: ExportPanelProps) {
  const defaultBase = defaultReportBaseName(todayIsoDate());
  const [baseName, setBaseName] = useState(defaultBase);
  const [scope, setScope] = useState<Scope>('filtered');
  const [busy, setBusy] = useState<ExportFormatId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveScope: Scope = scope === 'selected' && selectedTrees.length > 0 ? 'selected' : 'filtered';
  const trees = effectiveScope === 'selected' ? selectedTrees : filteredTrees;

  const runExport = async (format: ExportFormat) => {
    setBusy(format.id);
    setNotice(null);
    setError(null);
    const fileName = buildFileName(baseName, format.extension, defaultBase);
    try {
      const result = await saveFileWithPicker({
        fileName,
        extension: format.extension,
        mimeType: format.mimeType,
        description: format.pickerDescription,
        generate: () =>
          format.generate(
            {
              trees,
              species: speciesFrequency(trees),
              generatedAt: new Date(),
              generatedBy,
              filtersSummary: effectiveScope === 'selected' ? [...filtersSummary, `Zaznaczone ręcznie: ${trees.length}`] : filtersSummary,
            },
            fileName.slice(0, -format.extension.length),
          ),
      });
      if (result === 'saved') setNotice(`Zapisano plik ${fileName}.`);
      if (result === 'downloaded') setNotice(`Pobrano plik ${fileName}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wygenerować pliku.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={cn(PANEL_CLASS, 'flex flex-col')}>
      <PanelHeader
        icon={Download}
        title="Eksportuj przefiltrowane dane"
        description="Pliki generowane są w przeglądarce — przed zapisem wybierzesz folder docelowy."
      />
      <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-file-name" className={FIELD_LABEL_CLASS}>
            Nazwa pliku (bez rozszerzenia)
          </label>
          <Input
            id="export-file-name"
            className={cn(FIELD_CLASS, 'font-medium')}
            value={baseName}
            onChange={(e) => setBaseName(e.target.value)}
            onBlur={() => !baseName.trim() && setBaseName(defaultBase)}
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={cn(FIELD_LABEL_CLASS, 'mb-1.5')}>Zakres eksportu</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/80 p-1">
            {(
              [
                ['filtered', `Przefiltrowane (${filteredTrees.length})`],
                ['selected', `Zaznaczone (${selectedTrees.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={value === 'selected' && selectedTrees.length === 0}
                aria-pressed={effectiveScope === value}
                onClick={() => setScope(value)}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50',
                  effectiveScope === value
                    ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-2.5">
          {EXPORT_FORMATS.map((format) => {
            const { icon: Icon, tile } = FORMAT_LOOK[format.id];
            return (
              <button
                key={format.id}
                type="button"
                disabled={busy !== null || trees.length === 0}
                onClick={() => void runExport(format)}
                className="group flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-3 text-left transition-all hover:-translate-y-px hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                <span className={cn(ICON_TILE, tile)}>
                  {busy === format.id ? <Spinner className="size-5" /> : <Icon className="size-5" />}
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm font-semibold text-slate-900">
                  {format.label}
                  <span className="rounded bg-slate-100 px-1.5 py-px font-mono text-[11px] font-medium text-slate-500">
                    {format.extension}
                  </span>
                </span>
                <ArrowDownToLine className="size-4 shrink-0 text-slate-300 transition-colors group-hover:text-emerald-700" />
              </button>
            );
          })}

          <div className="flex items-center gap-3.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3">
            <span className={cn(ICON_TILE, 'bg-slate-800 text-white ring-slate-900/10')}>
              <FileBox className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm font-semibold text-slate-900">
              Format
              <span className="rounded bg-slate-200/70 px-1.5 py-px font-mono text-[11px] font-medium text-slate-600">.dwg</span>
            </span>
          </div>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="size-4" />
            {notice}
          </p>
        )}
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {trees.length === 0 && <p className="text-sm text-slate-500">Brak roślin do eksportu — zmień filtry.</p>}
      </div>
    </section>
  );
}
