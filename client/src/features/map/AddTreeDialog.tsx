import { FileCheck2, HardHat, Hash, Lock, MapPin, Save } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/shared/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shared/Dialog';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Input, Label, Select } from '@/components/shared/FormControls';
import { StatusDot } from '@/components/shared/StatusDot';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CONTRACTOR_ID,
  PLANT_TYPE_LABELS,
  type PlantType,
  type Species,
  type TreeListItem,
  type TreeStatus,
  type User,
} from '@/types/domain';
import { SpeciesCombobox } from './SpeciesCombobox';
import type { ReverseGeocodeResult } from './useReverseGeocode';

export interface LatLng {
  lat: number;
  lng: number;
}

interface AddTreeDialogProps {
  /** Clicked map position; `null` closes the dialog. */
  position: LatLng | null;
  onClose: () => void;
  onCreated: (tree: TreeListItem) => void;
  /** Parcel + address for `position` (GET /api/geocode/reverse); prefills address and plot number. */
  geocode?: { data: ReverseGeocodeResult | null; loading: boolean; error: string | null };
}

/** Allowed initial statuses when adding a new plant (Pkt 17: no 'red' / "Do wycinki"). */
const INITIAL_STATUS_OPTIONS: { value: Extract<TreeStatus, 'green' | 'blue'>; label: string }[] = [
  { value: 'green', label: 'Istniejące / Zdrowe' },
  { value: 'blue', label: 'Do posadzenia / nowe nasadzenie' },
];

export function AddTreeDialog({ position, onClose, onCreated, geocode }: AddTreeDialogProps) {
  return (
    <Dialog open={position !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {position && (
          <AddTreeForm
            key={`${position.lat},${position.lng}`}
            position={position}
            onCreated={onCreated}
            onCancel={onClose}
            geocode={geocode}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function useNextCode(type: PlantType) {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setCode(null);
    api
      .get<{ code: string }>(`/api/trees/next-code?type=${type}`)
      .then((r) => !cancelled && setCode(r.code))
      .catch(() => !cancelled && setCode('—'));
    return () => {
      cancelled = true;
    };
  }, [type]);
  return code;
}

function useContractors() {
  const [contractors, setContractors] = useState<User[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .get<User[]>('/api/users')
      .then((users) => !cancelled && setContractors(users.filter((u) => u.role === 'contractor')))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return contractors;
}

const CURRENT_YEAR = new Date().getFullYear();

function AddTreeForm({
  position,
  onCreated,
  onCancel,
  geocode,
}: {
  position: LatLng;
  onCreated: (tree: TreeListItem) => void;
  onCancel: () => void;
  geocode?: AddTreeDialogProps['geocode'];
}) {
  const id = useId();
  const contractors = useContractors();
  const [latitude, setLatitude] = useState(position.lat.toFixed(6));
  const [longitude, setLongitude] = useState(position.lng.toFixed(6));
  const [type, setType] = useState<PlantType>('tree');
  const [species, setSpecies] = useState<Species | null>(null);
  const [address, setAddress] = useState('');
  const [plotNumber, setPlotNumber] = useState('');
  const [plantingYear, setPlantingYear] = useState(String(CURRENT_YEAR));
  const [unknownYear, setUnknownYear] = useState(false);
  const [status, setStatus] = useState<'green' | 'blue'>('green');
  const [contractorId, setContractorId] = useState<string>(CONTRACTOR_ID);
  const [isFromDecision, setIsFromDecision] = useState(false);
  const [decisionNumber, setDecisionNumber] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [fundingSource, setFundingSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextCode = useNextCode(type);

  // Prefill from the geocoder, but never overwrite what the official has typed.
  const addressTouched = useRef(false);
  const plotTouched = useRef(false);
  const geocodeData = geocode?.data ?? null;
  useEffect(() => {
    if (!geocodeData) return;
    if (!addressTouched.current && geocodeData.address) setAddress(geocodeData.address);
    if (!plotTouched.current && geocodeData.plot_number) setPlotNumber(geocodeData.plot_number);
  }, [geocodeData]);

  const changeType = (next: PlantType) => {
    setType(next);
    if (species && species.type !== next) setSpecies(null);
  };

  const handleStatusChange = (nextStatus: 'green' | 'blue') => {
    setStatus(nextStatus);
    if (nextStatus === 'blue' && !contractorId) {
      setContractorId(CONTRACTOR_ID);
    }
  };

  const isToBePlanted = status === 'blue';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return setError('Podaj poprawne współrzędne.');
    if (!species) return setError('Wybierz gatunek ze słownika.');
    const year = unknownYear ? null : plantingYear.trim() ? Number(plantingYear) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1800 || year > 2100)) {
      return setError('Rok posadzenia musi być z zakresu 1800–2100.');
    }

    setSaving(true);
    setError(null);
    try {
      const created = await api.post<TreeListItem>('/api/trees', {
        type,
        species_id: species.id,
        latitude: lat,
        longitude: lng,
        address,
        plot_number: plotNumber,
        parcel_geometry: geocodeData?.geometry ? JSON.stringify(geocodeData.geometry) : null,
        planting_year: year,
        is_from_decision: isFromDecision,
        decision_number: isFromDecision ? decisionNumber : null,
        status,
        contractor_id: contractorId || (isToBePlanted ? CONTRACTOR_ID : null),
        assign_planting_task: isToBePlanted,
        contract_number: contractNumber,
        funding_source: fundingSource,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać rośliny.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Dodaj roślinę do ewidencji</DialogTitle>
        <DialogDescription>Uzupełnij kartę ewidencyjną. Kod nadaje serwer w momencie zapisu.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Typ rośliny" className="col-span-2 sm:col-span-1">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            {(['tree', 'shrub'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => changeType(t)}
                className={cn(
                  'flex h-8 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
                  type === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                <StatusDot status={status} shape={t === 'tree' ? 'circle' : 'square'} />
                {PLANT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Kod ewidencyjny (podgląd)" className="col-span-2 sm:col-span-1">
          <div className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-3">
            <Hash className="size-4 text-emerald-700" />
            {nextCode ? (
              <span className="font-mono text-base font-bold text-emerald-900">{nextCode}</span>
            ) : (
              <Spinner className="size-4" />
            )}
          </div>
        </Field>

        <Field label="Gatunek (słownik 100 gatunków)" htmlFor={`${id}-species`} className="col-span-2">
          <SpeciesCombobox
            id={`${id}-species`}
            value={species}
            type={type}
            onChange={setSpecies}
            placeholder={type === 'tree' ? 'Szukaj drzewa, np. lipa, Acer…' : 'Szukaj krzewu / byliny…'}
          />
        </Field>

        <Field label="Szerokość geogr. (lat)" htmlFor={`${id}-lat`}>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id={`${id}-lat`}
              className="pl-9 font-mono"
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              required
            />
          </div>
        </Field>
        <Field label="Długość geogr. (lng)" htmlFor={`${id}-lng`}>
          <Input
            id={`${id}-lng`}
            className="font-mono"
            inputMode="decimal"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            required
          />
        </Field>

        <Field label="Adres / opis lokalizacji" htmlFor={`${id}-address`} className="col-span-2 sm:col-span-1">
          <Input
            id={`${id}-address`}
            placeholder="np. Stary Rynek, Płock"
            value={address}
            onChange={(e) => {
              addressTouched.current = true;
              setAddress(e.target.value);
            }}
          />
        </Field>
        <Field label="Nr działki ewidencyjnej" htmlFor={`${id}-plot`} className="col-span-2 sm:col-span-1">
          <Input
            id={`${id}-plot`}
            placeholder="np. 146201_1.0001.123/4"
            value={plotNumber}
            onChange={(e) => {
              plotTouched.current = true;
              setPlotNumber(e.target.value);
            }}
          />
          {geocode?.loading && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <Spinner className="size-3" /> Pobieranie działki i adresu z GUGiK…
            </span>
          )}
          {geocodeData?.parcel_label && (
            <span className="text-xs text-emerald-700">
              {geocodeData.parcel_label}
              {geocodeData.precinct ? `, obręb ${geocodeData.precinct}` : ''}
            </span>
          )}
          {geocode?.error && <span className="text-xs text-amber-700">{geocode.error} Uzupełnij ręcznie.</span>}
        </Field>

        <Field label="Rok posadzenia" htmlFor={`${id}-year`} className="col-span-2 sm:col-span-1">
          <Input
            id={`${id}-year`}
            type={unknownYear ? 'text' : 'number'}
            min={1800}
            max={2100}
            disabled={unknownYear}
            value={unknownYear ? 'Nieznany' : plantingYear}
            onChange={(e) => setPlantingYear(e.target.value)}
          />
          <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={unknownYear}
              onChange={(e) => setUnknownYear(e.target.checked)}
              className="size-4 rounded border-slate-300 accent-emerald-700"
            />
            Nieznany rok posadzenia
          </label>
        </Field>

        <Field label="Status początkowy" htmlFor={`${id}-status`} className="col-span-2 sm:col-span-1">
          <Select
            id={`${id}-status`}
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as 'green' | 'blue')}
          >
            {INITIAL_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          {isToBePlanted && (
            <span className="text-xs font-medium text-blue-700">
              Po zapisie wykonawca automatycznie otrzyma zadanie: <strong>Nasadzanie: Posadzenie</strong>.
            </span>
          )}
        </Field>

        <fieldset className="col-span-2 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2 sm:items-end">
          <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <HardHat className="size-3.5" />
            Wykonawca odpowiedzialny
          </legend>
          <Field label="Przypisany wykonawca" htmlFor={`${id}-contractor`} className="sm:col-span-2">
            <Select
              id={`${id}-contractor`}
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
              className="bg-white"
            >
              {!isToBePlanted && <option value="">Nie przypisano</option>}
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>

        <fieldset className="col-span-2 grid grid-cols-1 gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 sm:grid-cols-2 sm:items-end">
          <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
            <FileCheck2 className="size-3.5" />
            Decyzja administracyjna (Gwarancja 3 lata)
          </legend>
          <Field label="Z DECYZJI (nasadzenie zastępcze)">
            <div className="grid h-10 grid-cols-2 items-center gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
              {(
                [
                  { value: false, label: 'Nie' },
                  { value: true, label: 'Tak (Z DECYZJI)' },
                ] as const
              ).map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  aria-pressed={isFromDecision === opt.value}
                  onClick={() => setIsFromDecision(opt.value)}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-md text-sm font-medium transition-colors',
                    isFromDecision === opt.value
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Numer decyzji (opcjonalnie)" htmlFor={`${id}-decision`}>
            <Input
              id={`${id}-decision`}
              placeholder="np. WOŚ.6131.44.2026"
              disabled={!isFromDecision}
              value={isFromDecision ? decisionNumber : ''}
              onChange={(e) => setDecisionNumber(e.target.value)}
              className="bg-white"
            />
          </Field>
        </fieldset>

        <fieldset className="col-span-2 grid grid-cols-2 gap-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <Lock className="size-3.5" />
            Dane wrażliwe — tylko urzędnik
          </legend>
          <Field label="Numer umowy" htmlFor={`${id}-contract`}>
            <Input
              id={`${id}-contract`}
              placeholder="np. UM/ZZ/2026/014"
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
            />
          </Field>
          <Field label="Źródło finansowania / dofinansowanie" htmlFor={`${id}-funding`}>
            <Input
              id={`${id}-funding`}
              placeholder="np. Budżet Obywatelski 2026"
              value={fundingSource}
              onChange={(e) => setFundingSource(e.target.value)}
            />
          </Field>
        </fieldset>
      </div>

      {error && <ErrorMessage className="mt-4">{error}</ErrorMessage>}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Anuluj
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner className="size-4 text-white" /> : <Save />}
          Zapisz roślinę
        </Button>
      </DialogFooter>
    </form>
  );
}
