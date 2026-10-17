import { AlertTriangle, CheckCircle2, FileDown, ImageIcon, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/shared/Dialog';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Input, Label, Select } from '@/components/shared/FormControls';
import { PlantBadge } from '@/components/shared/PlantBadge';
import { StatusDot } from '@/components/shared/StatusDot';
import { BASE_LAYERS } from '@/features/map/mapConfig';
import { TREE_STATUS_META } from '@/types/domain';
import { compareTreeCodes, todayIsoDate, type ListTree } from './inventoryModel';
import { buildFileName, saveFileWithPicker } from './lib/saveFile';
import { captureMapArea, isInsideArea, type AreaBounds, type MapAreaImage } from './mapAreaCapture';

interface MapAreaPdfDialogProps {
  area: AreaBounds | null;
  trees: ListTree[];
  generatedBy: string | null;
  onClose: () => void;
}

const PDF_EXTENSION = '.pdf';

export function MapAreaPdfDialog({ area, trees, generatedBy, onClose }: MapAreaPdfDialogProps) {
  const defaultName = `Mapa_Wycinek_Plock_${todayIsoDate()}${PDF_EXTENSION}`;
  const [fileName, setFileName] = useState(defaultName);
  const [baseLayerIndex, setBaseLayerIndex] = useState(0);
  const [withParcels, setWithParcels] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [image, setImage] = useState<MapAreaImage | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const insideTrees = useMemo(
    () =>
      area
        ? trees.filter((t) => isInsideArea(area, t.latitude, t.longitude)).sort((a, b) => compareTreeCodes(a.code, b.code))
        : [],
    [area, trees],
  );

  useEffect(() => {
    if (!area) return;
    let cancelled = false;
    setCapturing(true);
    setImage(null);
    setError(null);
    captureMapArea(area, insideTrees, { baseLayerIndex, withParcels })
      .then((result) => !cancelled && setImage(result))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Nie udało się pobrać wycinka mapy.'))
      .finally(() => !cancelled && setCapturing(false));
    return () => {
      cancelled = true;
    };
  }, [area, insideTrees, baseLayerIndex, withParcels, attempt]);

  useEffect(() => {
    if (area) {
      setFileName(`Mapa_Wycinek_Plock_${todayIsoDate()}${PDF_EXTENSION}`);
      setNotice(null);
    }
  }, [area]);

  const save = async () => {
    if (!area || !image) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const finalName = buildFileName(fileName, PDF_EXTENSION, defaultName.slice(0, -PDF_EXTENSION.length));
    try {
      const result = await saveFileWithPicker({
        fileName: finalName,
        extension: PDF_EXTENSION,
        mimeType: 'application/pdf',
        description: 'Dokument PDF',
        generate: async () =>
          (await import('./formats/mapAreaPdf')).buildMapAreaPdf({
            area,
            image,
            trees: insideTrees,
            baseLayerName: image.baseLayerName ?? 'brak — usługi WMS Geoportalu niedostępne',
            generatedAt: new Date(),
            generatedBy,
          }),
      });
      if (result === 'saved') setNotice(`Zapisano ${finalName}.`);
      if (result === 'downloaded') setNotice(`Pobrano ${finalName} do folderu pobranych plików.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać PDF.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={area !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Eksport wycinka mapy do PDF</DialogTitle>
          <DialogDescription>
            Podgląd zaznaczonego obszaru (Geoportal GUGiK) z naniesionymi roślinami oraz ich lista. PDF zawiera zdjęcie
            wycinka i tabelę roślin.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-3">
            <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {image && <img src={image.dataUrl} alt="Podgląd zaznaczonego obszaru mapy" className="block h-auto max-h-[55vh] w-full object-contain" />}
              {capturing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 text-sm text-slate-600">
                  <Spinner />
                  Pobieranie wycinka z Geoportalu…
                </div>
              )}
              {!image && !capturing && (
                <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
                  <ImageIcon className="size-8" />
                  Brak podglądu
                </div>
              )}
            </div>
            {image?.warnings.map((warning) => (
              <p key={warning} className="flex items-center gap-2 text-xs text-amber-700">
                <AlertTriangle className="size-3.5 shrink-0" />
                {warning}
              </p>
            ))}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="area-base-layer">Podkład</Label>
                <Select
                  id="area-base-layer"
                  className="w-72"
                  value={baseLayerIndex}
                  onChange={(e) => setBaseLayerIndex(Number(e.target.value))}
                >
                  {BASE_LAYERS.map((layer, i) => (
                    <option key={layer.name} value={i}>
                      {layer.name}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="size-4 accent-emerald-700"
                  checked={withParcels}
                  onChange={(e) => setWithParcels(e.target.checked)}
                />
                Działki i budynki (KIEG)
              </label>
              <Button variant="ghost" size="sm" className="h-10" disabled={capturing} onClick={() => setAttempt((a) => a + 1)}>
                <RefreshCw />
                Odśwież podgląd
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <p className="text-sm font-semibold text-slate-800">
              Rośliny w zaznaczonym obszarze: <span className="text-emerald-800">{insideTrees.length}</span>
            </p>
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {insideTrees.length === 0 && <li className="p-3 text-sm text-slate-500">Brak roślin w tym obszarze.</li>}
              {insideTrees.map((tree) => (
                <li key={tree.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <PlantBadge type={tree.type} code={tree.code} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-slate-700" title={tree.address ?? undefined}>
                    {tree.species_label}
                  </span>
                  <StatusDot status={tree.status} shape={tree.type === 'tree' ? 'circle' : 'square'} />
                  <span className="sr-only">{TREE_STATUS_META[tree.status].label}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="area-pdf-name">Nazwa pliku</Label>
              <Input id="area-pdf-name" value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </div>
            {notice && (
              <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="size-4" />
                {notice}
              </p>
            )}
            {error && <ErrorMessage>{error}</ErrorMessage>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Zamknij
          </Button>
          <Button disabled={!image || capturing || saving} onClick={() => void save()}>
            {saving ? <Spinner className="size-4 text-white" /> : <FileDown />}
            Wybierz miejsce zapisu i pobierz PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
