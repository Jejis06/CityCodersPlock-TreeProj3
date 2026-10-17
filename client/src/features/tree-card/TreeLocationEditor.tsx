import { Crosshair, HardHat, MapPin, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
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
import { Label, Select } from '@/components/shared/FormControls';
import type { ReverseGeocodeResult } from '@/features/map/useReverseGeocode';
import { api } from '@/lib/api';
import { speciesLabel, type TreeDetails, type User } from '@/types/domain';

export interface RelocateTarget {
  lat: number;
  lng: number;
  nonce: number;
}

interface TreeLocationEditorProps {
  tree: TreeDetails;
  relocating: boolean;
  relocateTarget?: RelocateTarget | null;
  onToggleRelocate: () => void;
  onTreeUpdated: (updated: TreeDetails, noticeMessage?: string) => void;
  onTreeDeleted: (treeId: string) => void;
}

/**
 * Panel edycji drzewa dla Urzędnika:
 * - zmiana/przepisanie wykonawcy (PATCH /api/trees/:id),
 * - przesunięcie punktu na mapie z automatycznym pobraniem adresu i działki z /api/geocode/reverse,
 * - usunięcie drzewa z modalem potwierdzenia (DELETE /api/trees/:id).
 */
export function TreeLocationEditor({
  tree,
  relocating,
  relocateTarget,
  onToggleRelocate,
  onTreeUpdated,
  onTreeDeleted,
}: TreeLocationEditorProps) {
  const id = useId();
  const [contractors, setContractors] = useState<User[]>([]);
  const [updatingContractor, setUpdatingContractor] = useState(false);
  const [relocatingBusy, setRelocatingBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handledNonceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<User[]>('/api/users')
      .then((users) => {
        if (!cancelled) setContractors(users.filter((u) => u.role === 'contractor'));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setError(null);
  }, [tree.id]);

  // Handle new map click in relocate mode: reverse-geocode new coordinates and PATCH tree.
  useEffect(() => {
    if (!relocateTarget || handledNonceRef.current === relocateTarget.nonce) return;
    handledNonceRef.current = relocateTarget.nonce;

    let cancelled = false;
    const run = async () => {
      setRelocatingBusy(true);
      setError(null);
      try {
        let geocode: ReverseGeocodeResult | null = null;
        try {
          geocode = await api.get<ReverseGeocodeResult>(
            `/api/geocode/reverse?lat=${relocateTarget.lat}&lng=${relocateTarget.lng}`,
          );
        } catch {
          // Even if GUGiK upstream fails, still update coordinates.
        }

        const payload: Record<string, unknown> = {
          latitude: Number(relocateTarget.lat.toFixed(6)),
          longitude: Number(relocateTarget.lng.toFixed(6)),
        };
        if (geocode) {
          payload.address = geocode.address;
          payload.plot_number = geocode.plot_number;
          payload.parcel_geometry = geocode.geometry ? JSON.stringify(geocode.geometry) : null;
        }

        const updated = await api.patch<TreeDetails>(`/api/trees/${encodeURIComponent(tree.id)}`, payload);
        if (!cancelled) {
          onTreeUpdated(
            updated,
            geocode?.plot_number || geocode?.address
              ? 'Przesunięto punkt na mapie oraz zaktualizowano adres i działkę z GUGiK.'
              : 'Przesunięto punkt na mapie i zapisano nowe współrzędne.',
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Nie udało się zaktualizować lokalizacji drzewa.');
        }
      } finally {
        if (!cancelled) setRelocatingBusy(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [onTreeUpdated, relocateTarget, tree.id]);

  const handleContractorChange = async (nextContractorId: string) => {
    setUpdatingContractor(true);
    setError(null);
    try {
      const updated = await api.patch<TreeDetails>(`/api/trees/${encodeURIComponent(tree.id)}`, {
        contractor_id: nextContractorId || null,
      });
      onTreeUpdated(updated, 'Zaktualizowano przypisanego wykonawcę.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zmienić wykonawcy.');
    } finally {
      setUpdatingContractor(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/api/trees/${encodeURIComponent(tree.id)}`);
      setConfirmDeleteOpen(false);
      onTreeDeleted(tree.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć rośliny.');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3.5">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-contractor`} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <HardHat className="size-3.5 text-slate-500" />
          Zmień wykonawcę
        </Label>
        <div className="flex items-center gap-2">
          <Select
            id={`${id}-contractor`}
            value={tree.contractor_id ?? ''}
            disabled={updatingContractor}
            onChange={(e) => void handleContractorChange(e.target.value)}
            className="bg-white"
          >
            <option value="">Nie przypisano</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
          {updatingContractor && <Spinner className="size-4 shrink-0" />}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          variant={relocating ? 'default' : 'outline'}
          size="sm"
          className="flex-1"
          disabled={relocatingBusy}
          onClick={onToggleRelocate}
        >
          {relocatingBusy ? <Spinner className="size-4" /> : <Crosshair className="size-4" />}
          {relocating ? 'Anuluj przesuwanie' : 'Przesuń punkt na mapie'}
        </Button>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={relocatingBusy || deleting}
        >
          <Trash2 className="size-4" />
          Usuń drzewo
        </Button>
      </div>

      {relocating && (
        <p className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
          <MapPin className="size-4 shrink-0 text-emerald-700" />
          Kliknij nowe miejsce na mapie — współrzędne, adres oraz nr działki z GUGiK zaktualizują się automatycznie.
        </p>
      )}

      {relocatingBusy && (
        <p className="flex items-center gap-2 text-xs text-slate-600">
          <Spinner className="size-3.5" />
          Pobieranie adresu i działki z GUGiK oraz zapisywanie nowej lokalizacji…
        </p>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <Dialog open={confirmDeleteOpen} onOpenChange={(open) => !open && !deleting && setConfirmDeleteOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Usunąć roślinę {tree.code}?</DialogTitle>
            <DialogDescription>
              Czy na pewno chcesz trwale usunąć roślinę{' '}
              <strong className="font-semibold text-slate-800">
                {tree.code} ({speciesLabel(tree.species_polish_name, tree.species_cultivar)})
              </strong>{' '}
              z ewidencji? Operacja usunie również wszystkie powiązane zadania z dziennika prac.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>
              Anuluj
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirmDelete()} disabled={deleting}>
              {deleting ? <Spinner className="size-4 text-white" /> : <Trash2 className="size-4" />}
              Usuń drzewo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
