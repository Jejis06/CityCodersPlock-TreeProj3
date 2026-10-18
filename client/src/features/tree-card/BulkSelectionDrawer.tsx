import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardPlus,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  HardHat,
  History,
  Landmark,
  Layers,
  MapPin,
  Maximize2,
  Paperclip,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Input, Label, Select, Textarea } from '@/components/shared/FormControls';
import { PlantBadge, TaskCategoryChip } from '@/components/shared/PlantBadge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/shared/Sheet';
import { StatusDot } from '@/components/shared/StatusDot';
import { formatSelectedPlantsLabel } from '@/features/map/CursorModeToolbar';
import { api, assetUrl } from '@/lib/api';
import { cn, compareTasksNewestFirst, formatDateTime } from '@/lib/utils';
import {
  CONTRACTOR_ID,
  speciesLabel,
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  TASK_SUBCATEGORIES,
  TASK_SUBCATEGORY_LABELS,
  TREE_STATUS_FOR_CATEGORY,
  TREE_STATUS_META,
  type TaskCategory,
  type TaskSubcategory,
  type TreeDetails,
  type TreeListItem,
  type TreeStatus,
  type User,
} from '@/types/domain';
import { PhotoLightbox, taskToLightboxPhoto, type LightboxPhoto } from './PhotoLightbox';

const CATEGORIES = Object.keys(TASK_SUBCATEGORIES) as TaskCategory[];

const DEFAULT_SUBCATEGORY: Record<TaskCategory, TaskSubcategory> = {
  pielegnacja: 'podlewanie',
  wycinka: 'wycinka',
  nasadzanie: 'korowanie',
};

const SHORT_STATUS_LABELS: Record<TreeStatus, string> = {
  green: 'Zdrowe',
  yellow: 'W trakcie prac',
  red: 'Do wycinki',
  blue: 'Do posadzenia',
};

interface BulkTaskResponse {
  created_count: number;
  task_ids: string[];
  tree_ids: string[];
  status: TreeStatus;
}

export interface BulkSelectionDrawerProps {
  /** Selected plants from the map. Drawer opens when `trees.length > 0`. */
  trees: TreeListItem[];
  /** Unselect a single plant without losing the rest of the selection. */
  onRemoveTree: (treeId: string) => void;
  /** Clear all selected plants / close the drawer. */
  onClearSelection: () => void;
  /** Center map over a specific plant from the list without losing the bulk selection. */
  onFocusTree?: (tree: TreeListItem) => void;
  /** Called after bulk tasks are created so the map reloads immediately. */
  onTasksCreated?: (count: number) => void;
}

/**
 * Panel boczny dla wielu zaznaczonych roślin (w trybie punktowym lub przestrzennym):
 * - skrócona lista zaznaczonych roślin z odznaczaniem pojedynczych pozycji (`X`),
 * - rozwijany szybki podgląd każdego drzewa (działka, umowa, ostatnie prace, zdjęcia) bez utraty zaznaczenia,
 * - formularz masowego zlecania wspólnego zadania (`POST /api/tasks/bulk`) z wyborem wykonawcy (domyślnie Jan Zieliński).
 */
export function BulkSelectionDrawer({
  trees,
  onRemoveTree,
  onClearSelection,
  onFocusTree,
  onTasksCreated,
}: BulkSelectionDrawerProps) {
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expandedTreeId, setExpandedTreeId] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, TreeDetails>>({});
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxPhoto | null>(null);

  const [contractors, setContractors] = useState<User[]>([]);
  const [contractorId, setContractorId] = useState<string>(CONTRACTOR_ID);
  const [category, setCategory] = useState<TaskCategory>('pielegnacja');
  const [cosmeticCategory, setCosmeticCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<TaskSubcategory>(DEFAULT_SUBCATEGORY.pielegnacja);
  const [contractNumber, setContractNumber] = useState('UM/ZIEL/12/2026');
  const [contractScanUrl, setContractScanUrl] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<User[]>('/api/users')
      .then((users) => {
        if (cancelled) return;
        const onlyContractors = users.filter((u) => u.role === 'contractor');
        setContractors(onlyContractors);
        const firstContractor = onlyContractors[0];
        if (firstContractor && !onlyContractors.some((c) => c.id === contractorId)) {
          setContractorId(firstContractor.id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [contractorId]);

  // Pre-fill contract number from the first selected tree that has one if the user hasn't typed a custom one.
  const suggestedContractNumber = useMemo(
    () => trees.find((t) => t.contract_number)?.contract_number ?? 'UM/ZIEL/12/2026',
    [trees],
  );

  useEffect(() => {
    if (!contractNumber.trim()) {
      setContractNumber(suggestedContractNumber);
    }
  }, [contractNumber, suggestedContractNumber]);

  // If the currently expanded tree was removed from selection, collapse the preview.
  useEffect(() => {
    if (expandedTreeId && !trees.some((t) => t.id === expandedTreeId)) {
      setExpandedTreeId(null);
    }
  }, [expandedTreeId, trees]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const togglePreview = async (treeId: string) => {
    if (expandedTreeId === treeId) {
      setExpandedTreeId(null);
      return;
    }
    setExpandedTreeId(treeId);
    setDetailsError(null);
    if (detailsCache[treeId]) return;

    setLoadingDetailsId(treeId);
    try {
      const details = await api.get<TreeDetails>(`/api/trees/${encodeURIComponent(treeId)}`);
      setDetailsCache((prev) => ({ ...prev, [treeId]: details }));
    } catch (e) {
      setDetailsError(e instanceof Error ? e.message : 'Nie udało się pobrać szczegółów rośliny.');
    } finally {
      setLoadingDetailsId((current) => (current === treeId ? null : current));
    }
  };

  const handleCategoryChange = (next: TaskCategory) => {
    setCosmeticCategory(null);
    setCategory(next);
    setSubcategory(DEFAULT_SUBCATEGORY[next]);
  };

  const handleUploadScan = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const uploaded = await api.upload(file);
      setContractScanUrl(uploaded.url);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Nie udało się wgrać załącznika.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmitBulkTask = async (e: FormEvent) => {
    e.preventDefault();
    if (trees.length === 0) return;
    if (!contractNumber.trim()) {
      setFormError('Podaj numer umowy.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setSuccessMessage(null);
    try {
      const result = await api.post<BulkTaskResponse>('/api/tasks/bulk', {
        tree_ids: trees.map((t) => t.id),
        category,
        subcategory,
        contractor_id: contractorId || CONTRACTOR_ID,
        contract_number: contractNumber.trim(),
        contract_scan_url: contractScanUrl.trim() || undefined,
        description: description.trim() || undefined,
      });

      // Invalidate cached previews so re-expanding shows the newly assigned task.
      setDetailsCache({});
      setDescription('');
      setSuccessMessage(
        `Zlecono zadanie (${TASK_CATEGORY_LABELS[category]}: ${TASK_SUBCATEGORY_LABELS[subcategory]}) dla ${formatSelectedPlantsLabel(result.created_count)}. Zadania trafiły na górę listy Wykonawcy!`,
      );
      onTasksCreated?.(result.created_count);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Nie udało się zlecić zadań grupowych.');
    } finally {
      setSaving(false);
    }
  };

  const nextStatus = TREE_STATUS_FOR_CATEGORY[category];
  const open = trees.length > 0;

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClearSelection()} modal={false}>
        <SheetContent
          modal={false}
          className="max-w-lg"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="border-b border-indigo-100 bg-gradient-to-r from-indigo-950 to-slate-900 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300">
              <Layers className="size-4" />
              Zaznaczenie grupowe na mapie
            </div>
            <SheetTitle className="text-xl text-white">
              Zaznaczono: {formatSelectedPlantsLabel(trees.length)}
            </SheetTitle>
            <SheetDescription className="text-indigo-200">
              Przejrzyj wybrane punkty, podejrzyj ich karty lub zleć wspólne zadanie dla całej grupy naraz.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 p-5">
            {successMessage && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-900 shadow-xs"
              >
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* 1. Skrócona lista zaznaczonych roślin + szybki podgląd */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Wybrane rośliny ({trees.length} szt.)
                </h3>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                  Odznacz wszystkie
                </button>
              </div>

              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {trees.map((tree) => {
                  const isExpanded = expandedTreeId === tree.id;
                  const details = detailsCache[tree.id];
                  const isLoadingDetails = loadingDetailsId === tree.id;

                  return (
                    <li
                      key={tree.id}
                      className={cn(
                        ' overflow-hidden rounded-xl border transition-colors',
                        isExpanded
                          ? 'border-indigo-300 bg-indigo-50/35 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center gap-2 p-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <PlantBadge type={tree.type} code={tree.code} size="sm" />
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                              title={TREE_STATUS_META[tree.status].label}
                            >
                              <StatusDot status={tree.status} className="size-2" />
                              {SHORT_STATUS_LABELS[tree.status]}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                            {speciesLabel(tree.species_polish_name, tree.species_cultivar)}
                          </p>
                          <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                            <MapPin className="size-3 shrink-0 text-slate-400" />
                            <span className="truncate">{tree.address ?? 'Brak adresu'}</span>
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={isExpanded ? 'default' : 'outline'}
                            className={cn(
                              'h-8 gap-1 px-2.5 text-xs',
                              isExpanded && 'bg-indigo-600 text-white hover:bg-indigo-700',
                            )}
                            onClick={() => void togglePreview(tree.id)}
                            title="Rozwiń szybki podgląd karty rośliny bez utraty zaznaczenia"
                          >
                            <Eye className="size-3.5" />
                            Podgląd
                            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          </Button>

                          <button
                            type="button"
                            onClick={() => onRemoveTree(tree.id)}
                            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            title={`Usuń ${tree.code} z zaznaczenia`}
                            aria-label={`Odznacz ${tree.code}`}
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-indigo-200/80 bg-white p-3 text-xs">
                          {isLoadingDetails && (
                            <div className="flex items-center justify-center gap-2 py-4 text-slate-500">
                              <Spinner className="size-4" />
                              Wczytywanie szczegółów rośliny {tree.code}…
                            </div>
                          )}

                          {detailsError && !details && <ErrorMessage>{detailsError}</ErrorMessage>}

                          {details && (
                            <ExpandedTreePreview
                              details={details}
                              onFocus={() => onFocusTree?.(tree)}
                              onOpenPhoto={setLightboxPhoto}
                            />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 2. Formularz zbiorczego zlecania zadania */}
            <section className="space-y-3 border-t border-slate-200 pt-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ClipboardPlus className="size-4 text-indigo-600" />
                Zleć wspólne zadanie dla zaznaczonych roślin ({trees.length} szt.)
              </h3>

              <form
                onSubmit={handleSubmitBulkTask}
                className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"
              >
                <div className="space-y-1.5">
                  <Label>Kategoria pracy</Label>
                  <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
                    {CATEGORIES.map((c) => {
                      const active = cosmeticCategory === null && category === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={active}
                          onClick={() => handleCategoryChange(c)}
                          className={cn(
                            'flex h-9 flex-1 basis-[30%] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors',
                            active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                          )}
                        >
                          <StatusDot status={TREE_STATUS_FOR_CATEGORY[c]} />
                          {TASK_CATEGORY_LABELS[c]}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      aria-pressed={cosmeticCategory === 'przesadzanie'}
                      onClick={() => setCosmeticCategory('przesadzanie')}
                      className={cn(
                        'flex h-9 flex-1 basis-[45%] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors',
                        cosmeticCategory === 'przesadzanie'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100',
                      )}
                    >
                      <StatusDot status="blue" />
                      Przesadzanie
                    </button>
                    <button
                      type="button"
                      aria-pressed={cosmeticCategory === 'zniszczenia'}
                      onClick={() => setCosmeticCategory('zniszczenia')}
                      className={cn(
                        'flex h-9 flex-1 basis-[45%] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors',
                        cosmeticCategory === 'zniszczenia'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100',
                      )}
                    >
                      <StatusDot status="red" />
                      Zniszczenia drzewa
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Podkategoria zabiegu</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_SUBCATEGORIES[category].map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={subcategory === s}
                        onClick={() => setSubcategory(s)}
                        className={cn(
                          'h-8 cursor-pointer rounded-full px-3 text-xs font-semibold ring-1 transition-colors',
                          subcategory === s
                            ? 'bg-indigo-100 text-indigo-950 ring-indigo-600'
                            : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50',
                        )}
                      >
                        {TASK_SUBCATEGORY_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-contractor`} className="flex items-center gap-1.5">
                    <HardHat className="size-3.5 text-slate-500" />
                    Przypisany Wykonawca
                  </Label>
                  <Select
                    id={`${formId}-contractor`}
                    value={contractorId}
                    onChange={(e) => setContractorId(e.target.value)}
                    className="bg-white"
                  >
                    {contractors.length > 0 ? (
                      contractors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} (Wykonawca terenowy / iPad)
                        </option>
                      ))
                    ) : (
                      <option value={CONTRACTOR_ID}>Jan Zieliński (Wykonawca terenowy / iPad)</option>
                    )}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-contract`}>Numer umowy</Label>
                  <Input
                    id={`${formId}-contract`}
                    className="bg-white"
                    placeholder="np. UM/ZIEL/12/2026"
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-scan`}>Skan umowy / załącznik (opcjonalnie)</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Paperclip className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id={`${formId}-scan`}
                        className="bg-white pl-9"
                        placeholder="URL lub nazwa pliku PDF"
                        value={contractScanUrl}
                        onChange={(e) => setContractScanUrl(e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Spinner className="size-4" /> : <Upload />}
                      Wgraj
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => void handleUploadScan(e.target.files?.[0])}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-desc`}>Opis dla wykonawcy (opcjonalnie)</Label>
                  <Textarea
                    id={`${formId}-desc`}
                    className="min-h-16 bg-white"
                    placeholder="np. Pilne podlanie i kontrola mis korzeniowych wzdłuż pierzei."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <p className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2.5 text-xs text-slate-600 ring-1 ring-slate-200">
                  <span>Nowy status dla {trees.length} roślin na mapie:</span>
                  <ArrowRight className="size-3.5 text-slate-400" />
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                    <StatusDot status={nextStatus} />
                    {TREE_STATUS_META[nextStatus].label}
                  </span>
                </p>

                {formError && <ErrorMessage>{formError}</ErrorMessage>}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-indigo-600 text-white shadow-md hover:bg-indigo-700"
                  disabled={saving || uploading || trees.length === 0}
                >
                  {saving ? <Spinner className="size-4 text-white" /> : <Send />}
                  Zleć zadanie dla {formatSelectedPlantsLabel(trees.length)}
                </Button>
              </form>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
    </>
  );
}

function ExpandedTreePreview({
  details,
  onFocus,
  onOpenPhoto,
}: {
  details: TreeDetails;
  onFocus: () => void;
  onOpenPhoto: (photo: LightboxPhoto) => void;
}) {
  const sortedTasks = useMemo(() => [...details.tasks].sort(compareTasksNewestFirst), [details.tasks]);
  const recentTasks = sortedTasks.slice(0, 3);
  const scanUrl = assetUrl(details.contract_scan_url);
  const isFromDecision = Boolean(details.is_from_decision);

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-slate-50 p-2.5 text-slate-700">
        <div className="flex items-center gap-1.5">
          <Landmark className="size-3.5 shrink-0 text-slate-400" />
          <dt className="text-slate-500">Działka:</dt>
          <dd className="truncate font-mono font-medium">{details.plot_number ?? '—'}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0 text-slate-400" />
          <dt className="text-slate-500">Rok:</dt>
          <dd className="font-medium">{details.planting_year ?? 'Nieznany'}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <HardHat className="size-3.5 shrink-0 text-slate-400" />
          <dt className="text-slate-500">Wykonawca:</dt>
          <dd className="truncate font-medium">{details.contractor_name ?? 'Nie przypisano'}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <FileCheck2 className="size-3.5 shrink-0 text-slate-400" />
          <dt className="text-slate-500">Z decyzji:</dt>
          <dd className="truncate font-medium">
            {isFromDecision ? details.decision_number ?? 'Tak' : 'Nie'}
          </dd>
        </div>
        <div className="col-span-2 flex items-center gap-1.5 border-t border-slate-200/70 pt-1.5">
          <FileText className="size-3.5 shrink-0 text-amber-600" />
          <dt className="text-slate-500">Umowa:</dt>
          <dd className="font-medium text-slate-900">{details.contract_number ?? '—'}</dd>
          {scanUrl && (
            <a
              href={scanUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
            >
              PDF <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {details.funding_source && (
          <div className="col-span-2 flex items-center gap-1.5">
            <Banknote className="size-3.5 shrink-0 text-amber-600" />
            <dt className="text-slate-500">Finansowanie:</dt>
            <dd className="truncate font-medium">{details.funding_source}</dd>
          </div>
        )}
      </dl>

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 font-semibold text-slate-700">
          <History className="size-3.5 text-slate-400" />
          Ostatnie prace ({details.tasks.length})
        </p>

        {recentTasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 p-2 text-slate-500">
            Brak zleconych zabiegów w historii tej rośliny.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentTasks.map((task) => {
              const photoUrl = assetUrl(task.contractor_photo_url);
              const lightbox = taskToLightboxPhoto(task, details.code);
              return (
                <li
                  key={task.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TaskCategoryChip category={task.category} subcategory={task.subcategory} size="sm" />
                      <Badge
                        variant={
                          task.status === 'approved'
                            ? 'default'
                            : task.status === 'pending_approval'
                              ? 'warning'
                              : task.status === 'rejected'
                                ? 'destructive'
                                : 'secondary'
                        }
                      >
                        {TASK_STATUS_LABELS[task.status]}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Zlecono: {formatDateTime(task.created_at)}
                    </p>
                    {task.contractor_comment && (
                      <p className="text-slate-700">„{task.contractor_comment}”</p>
                    )}
                  </div>

                  {photoUrl && lightbox && (
                    <button
                      type="button"
                      onClick={() => onOpenPhoto(lightbox)}
                      className="group relative shrink-0 overflow-hidden rounded-md ring-1 ring-slate-200"
                      title="Powiększ zdjęcie"
                    >
                      <img src={photoUrl} alt="Zdjęcie z wykonania" className="size-12 object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/45 group-hover:opacity-100">
                        <Maximize2 className="size-3.5" />
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Button type="button" size="sm" variant="outline" className="w-full text-xs" onClick={onFocus}>
        <MapPin className="size-3.5" />
        Pokaż {details.code} na mapie
      </Button>
    </div>
  );
}
