import { CheckCircle2, Download, FileSpreadsheet, FileText, Globe2, Info, PencilRuler, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Input, Label } from '@/components/shared/FormControls';
import { cn } from '@/lib/utils';
import { EXPORT_FORMATS, defaultReportBaseName, type ExportFormat, type ExportFormatId } from './ExportFormatGenerators';
import { speciesFrequency, todayIsoDate, type ListTree } from './inventoryModel';
import { buildFileName, saveFileWithPicker } from './lib/saveFile';

const FORMAT_ICONS: Record<ExportFormatId, LucideIcon> = {
  xlsx: FileSpreadsheet,
  dxf: PencilRuler,
  shp: Globe2,
  pdf: FileText,
};

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
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="size-4 text-emerald-700" />
          Eksportuj przefiltrowane dane
        </CardTitle>
        <CardDescription>Pliki generowane są w przeglądarce — przed zapisem wybierzesz folder docelowy.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="export-file-name">Nazwa pliku (bez rozszerzenia)</Label>
          <Input
            id="export-file-name"
            value={baseName}
            onChange={(e) => setBaseName(e.target.value)}
            onBlur={() => !baseName.trim() && setBaseName(defaultBase)}
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Zakres eksportu</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
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
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  effectiveScope === value ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-2">
          {EXPORT_FORMATS.map((format) => {
            const Icon = FORMAT_ICONS[format.id];
            return (
              <button
                key={format.id}
                type="button"
                disabled={busy !== null || trees.length === 0}
                onClick={() => void runExport(format)}
                className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-emerald-600 hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100">
                  {busy === format.id ? <Spinner className="size-5" /> : <Icon className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2 font-semibold text-slate-900">
                    {format.label}
                    <span className="font-mono text-xs font-medium text-slate-500">{format.extension}</span>
                  </span>
                  <span className="block text-xs text-slate-500">{format.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="flex gap-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
          <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
          <span>
            <strong>Format .dwg:</strong> DWG to zamknięty format binarny Autodesk. Otwórz wygenerowany plik .dxf w
            AutoCAD/BricsCAD i wybierz „Zapisz jako → Rysunek (.dwg)” — warstwy DRZEWA i KRZEWY zostaną zachowane.
          </span>
        </p>

        {notice && (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="size-4" />
            {notice}
          </p>
        )}
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {trees.length === 0 && <p className="text-sm text-slate-500">Brak roślin do eksportu — zmień filtry.</p>}
      </CardContent>
    </Card>
  );
}
