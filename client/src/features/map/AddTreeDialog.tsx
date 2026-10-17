import { Hash, Lock, MapPin, Save } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/shared/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/shared/Dialog';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Input, Label, Select } from '@/components/shared/FormControls';
import { StatusDot } from '@/components/shared/StatusDot';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  PLANT_TYPE_LABELS,
  TREE_STATUS_META,
  TREE_STATUSES,
  type PlantType,
  type Species,
  type TreeListItem,
  type TreeStatus,
} from '@/types/domain';
import { SpeciesCombobox } from './SpeciesCombobox';

export interface LatLng {
  lat: number;
  lng: number;
}

interface AddTreeDialogProps {
  /** Clicked map position; `null` closes the dialog. */
  position: LatLng | null;
  onClose: () => void;
  onCreated: (tree: TreeListItem) => void;
}

export function AddTreeDialog({ position, onClose, onCreated }: AddTreeDialogProps) {
  return (
    <Dialog open={position !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {position && (
          <AddTreeForm key={`${position.lat},${position.lng}`} position={position} onCreated={onCreated} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
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

const CURRENT_YEAR = new Date().getFullYear();

function AddTreeForm({
  position,
  onCreated,
  onCancel,
}: {
  position: LatLng;
  onCreated: (tree: TreeListItem) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [latitude, setLatitude] = useState(position.lat.toFixed(6));
  const [longitude, setLongitude] = useState(position.lng.toFixed(6));
  const [type, setType] = useState<PlantType>('tree');
  const [species, setSpecies] = useState<Species | null>(null);
  const [address, setAddress] = useState('');
  const [plotNumber, setPlotNumber] = useState('');
  const [plantingYear, setPlantingYear] = useState(String(CURRENT_YEAR));
  const [status, setStatus] = useState<TreeStatus>('green');
  const [contractNumber, setContractNumber] = useState('');
  const [fundingSource, setFundingSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextCode = useNextCode(type);

  const changeType = (next: PlantType) => {
    setType(next);
    if (species && species.type !== next) setSpecies(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return setError('Podaj poprawne współrzędne.');
    if (!species) return setError('Wybierz gatunek ze słownika.');
    const year = plantingYear.trim() ? Number(plantingYear) : null;
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
        planting_year: year,
        status,
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
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label="Nr działki ewidencyjnej" htmlFor={`${id}-plot`} className="col-span-2 sm:col-span-1">
          <Input
            id={`${id}-plot`}
            placeholder="np. 146201_1.0001.123/4"
            value={plotNumber}
            onChange={(e) => setPlotNumber(e.target.value)}
          />
        </Field>

        <Field label="Rok posadzenia" htmlFor={`${id}-year`}>
          <Input
            id={`${id}-year`}
            type="number"
            min={1800}
            max={2100}
            value={plantingYear}
            onChange={(e) => setPlantingYear(e.target.value)}
          />
        </Field>
        <Field label="Status początkowy" htmlFor={`${id}-status`}>
          <Select id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value as TreeStatus)}>
            {TREE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TREE_STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>

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
